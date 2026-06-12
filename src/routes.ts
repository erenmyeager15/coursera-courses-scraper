import { Actor, log } from 'apify';
import type { ActorInput, CourseraProductHit, CourseRecord, SearchOptions } from './types.js';

const COURSES_PER_PAGE = 12;
const MAX_RESULTS = 500;
const BASE_URL = 'https://www.coursera.org';

const DEFAULT_HEADERS: Record<string, string> = {
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.9',
    'cache-control': 'no-cache',
    'pragma': 'no-cache',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
};

export function normalizeInput(input: ActorInput): SearchOptions {
    const rawQueries = Array.isArray(input.queries) && input.queries.length > 0
        ? input.queries
        : input.keyword
            ? [input.keyword]
            : ['python'];

    const queries = unique(
        rawQueries
            .map((query) => cleanText(query))
            .filter((query): query is string => Boolean(query)),
    );

    return {
        queries: queries.length > 0 ? queries : ['python'],
        maxResults: clampInteger(input.maxResults ?? 100, 1, MAX_RESULTS),
        productTypes: unique((input.productTypes ?? []).map((type) => type.toUpperCase())),
        difficulties: unique((input.difficulties ?? []).map((difficulty) => difficulty.toUpperCase())),
        includeSkills: input.includeSkills !== false,
    };
}

export async function scrapeCoursera(options: SearchOptions): Promise<number> {
    const seenIds = new Set<string>();
    let pushed = 0;

    for (const query of options.queries) {
        const maxPages = Math.ceil(options.maxResults / COURSES_PER_PAGE) + 2;

        for (let page = 1; page <= maxPages && pushed < options.maxResults; page++) {
            const html = await fetchSearchPage(query, page);
            const hits = extractCourseraHits(html);
            log.info(`Coursera search page parsed`, { query, page, hits: hits.length });

            if (hits.length === 0) {
                if (page === 1) {
                    log.warning('No Coursera results found for query', { query });
                }
                break;
            }

            for (const hit of hits) {
                if (pushed >= options.maxResults) break;
                if (!passesFilters(hit, options)) continue;

                const record = toCourseRecord(hit, query, page, options.includeSkills);
                const dedupeKey = record.courseId ?? `${record.courseUrl ?? ''}:${record.title ?? ''}`;
                if (!dedupeKey || seenIds.has(dedupeKey)) continue;

                seenIds.add(dedupeKey);
                await Actor.pushData(record);
                await chargeForRecord();
                pushed++;
            }

            if (hits.length < COURSES_PER_PAGE) break;
            await sleep(randomInteger(600, 1400));
        }
    }

    return pushed;
}

async function fetchSearchPage(query: string, page: number): Promise<string> {
    const url = new URL('/search', BASE_URL);
    url.searchParams.set('query', query);
    if (page > 1) url.searchParams.set('page', String(page));

    const response = await fetchWithRetry(url.toString(), 3);
    const html = await response.text();

    if (!html.includes('window.__APOLLO_STATE__')) {
        throw new Error(`Coursera search page did not include Apollo state payload. Status: ${response.status}`);
    }

    return html;
}

async function fetchWithRetry(url: string, retries: number): Promise<Response> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url, { headers: DEFAULT_HEADERS });
            if (response.ok) return response;

            const retryable = response.status === 429 || response.status >= 500;
            if (!retryable) {
                throw new Error(`Request failed with HTTP ${response.status}: ${url}`);
            }
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
        }

        await sleep(randomInteger(1000, 3000) * attempt);
    }

    throw lastError ?? new Error(`Request failed after ${retries} attempts: ${url}`);
}

function extractCourseraHits(html: string): CourseraProductHit[] {
    const state = parseApolloState(html);
    const hits: CourseraProductHit[] = [];

    for (const [key, value] of Object.entries(state)) {
        if (!key.startsWith('Search_ProductHit:') || !isPlainObject(value)) continue;

        const hit = value as Record<string, unknown>;
        const name = stringValue(hit.name);
        const url = stringValue(hit.url);

        if (!name || !url) continue;

        hits.push({
            id: stringValue(hit.id),
            name,
            url,
            partners: stringArray(hit.partners),
            productType: stringValue(hit.productType),
            difficulty: stringValue(hit.productDifficultyLevel) ?? stringValue(hit.difficulty),
            duration: stringValue(hit.productDuration) ?? stringValue(hit.duration),
            skills: stringArray(hit.skills),
            rating: numberValue(hit.avgProductRating) ?? numberValue(hit.rating),
            ratings: numberValue(hit.numProductRatings) ?? numberValue(hit.ratings),
            imageUrl: stringValue(hit.imageUrl),
            free: booleanValue(hit.isCourseFree) ?? booleanValue(hit.free),
            plus: booleanValue(hit.isPartOfCourseraPlus) ?? booleanValue(hit.plus),
        });
    }

    return hits;
}

function parseApolloState(html: string): Record<string, unknown> {
    const markerMatch = /window\.__APOLLO_STATE__\s*=\s*/.exec(html);
    if (!markerMatch || markerMatch.index === undefined) {
        throw new Error('Coursera Apollo state marker not found.');
    }

    const jsonStart = html.indexOf('{', markerMatch.index + markerMatch[0].length);
    if (jsonStart === -1) {
        throw new Error('Coursera Apollo state JSON start not found.');
    }

    const jsonEnd = findJsonObjectEnd(html, jsonStart);
    const rawJson = html.slice(jsonStart, jsonEnd + 1);
    const parsed = JSON.parse(rawJson) as unknown;

    if (!isPlainObject(parsed)) {
        throw new Error('Coursera Apollo state payload was not an object.');
    }

    return parsed;
}

function findJsonObjectEnd(text: string, start: number): number {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < text.length; index++) {
        const char = text[index];

        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }

        if (char === '"') {
            inString = true;
        } else if (char === '{') {
            depth++;
        } else if (char === '}') {
            depth--;
            if (depth === 0) return index;
        }
    }

    throw new Error('Could not find end of Coursera Apollo state JSON.');
}

function passesFilters(hit: CourseraProductHit, options: SearchOptions): boolean {
    if (options.productTypes.length > 0) {
        const productType = hit.productType?.toUpperCase() ?? '';
        if (!options.productTypes.includes(productType)) return false;
    }

    if (options.difficulties.length > 0) {
        const difficulty = hit.difficulty?.toUpperCase() ?? '';
        if (!options.difficulties.includes(difficulty)) return false;
    }

    return true;
}

function toCourseRecord(hit: CourseraProductHit, query: string, page: number, includeSkills: boolean): CourseRecord {
    const relativeUrl = normalizePath(hit.url);
    const courseUrl = relativeUrl ? `${BASE_URL}${relativeUrl}` : null;
    const skills = includeSkills ? hit.skills ?? [] : [];

    return {
        source: 'coursera',
        query,
        courseId: hit.id ?? null,
        title: hit.name ?? null,
        courseUrl,
        courseSlug: relativeUrl ? relativeUrl.replace(/^\//, '') : null,
        productType: hit.productType ?? null,
        partners: hit.partners ?? [],
        partnerNames: joinValues(hit.partners),
        difficulty: hit.difficulty ?? null,
        duration: hit.duration ?? null,
        skills,
        skillNames: joinValues(skills),
        rating: finiteNumberOrNull(hit.rating),
        reviewCount: integerOrNull(hit.ratings),
        isFree: hit.free ?? null,
        isPartOfCourseraPlus: hit.plus ?? null,
        imageUrl: hit.imageUrl ?? null,
        resultPage: page,
        scrapedAt: new Date().toISOString(),
    };
}

async function chargeForRecord(): Promise<void> {
    try {
        await Actor.charge({ eventName: 'course-scraped' });
    } catch (error) {
        log.debug('Actor.charge skipped or failed in current environment', {
            message: error instanceof Error ? error.message : String(error),
        });
    }
}

function cleanText(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const cleaned = value.replace(/\s+/g, ' ').trim();
    return cleaned.length > 0 ? cleaned : null;
}

function normalizePath(value: string | undefined): string | null {
    const cleaned = cleanText(value);
    if (!cleaned) return null;
    if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
        try {
            return new URL(cleaned).pathname;
        } catch {
            return null;
        }
    }
    return cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
}

function stringValue(value: unknown): string | undefined {
    return cleanText(value) ?? undefined;
}

function stringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    return value.map((item) => cleanText(item)).filter((item): item is string => Boolean(item));
}

function numberValue(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
}

function booleanValue(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}

function finiteNumberOrNull(value: unknown): number | null {
    const number = numberValue(value);
    return number ?? null;
}

function integerOrNull(value: unknown): number | null {
    const number = numberValue(value);
    return number === undefined ? null : Math.trunc(number);
}

function joinValues(values: string[] | undefined): string | null {
    if (!values || values.length === 0) return null;
    return values.join(', ');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unique<T>(values: T[]): T[] {
    return [...new Set(values)];
}

function clampInteger(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(Math.max(Math.trunc(value), min), max);
}

function randomInteger(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
