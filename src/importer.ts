import { Buffer } from 'node:buffer';
import { InputError, inputObject, normalizeInput, textList } from './input.js';
import { numeric, redactText, safeCourseUrl } from './routes.js';
import type { CourseAnalysis, CourseObservation, ImportPlan } from './types.js';

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 1000;
type Row = Record<string, unknown>;
const ALIASES: Record<string, keyof CourseObservation> = {
    courseid: 'courseId', id: 'courseId', title: 'title', name: 'title', coursename: 'title',
    observedat: 'observedAt', scrapedat: 'observedAt', date: 'observedAt', courseurl: 'courseUrl', url: 'courseUrl',
    provider: 'provider', partnernames: 'provider', coursetype: 'courseType', producttype: 'courseType',
    difficulty: 'difficulty', skills: 'skills', skillnames: 'skills', language: 'language',
    durationhours: 'durationHours', durationlabel: 'durationLabel', rating: 'rating', reviewcount: 'reviewCount',
    available: 'available', certificateincluded: 'certificateIncluded', priceamount: 'priceAmount', price: 'priceAmount',
    additionalfeesamount: 'additionalFeesAmount', currency: 'currency', offercountry: 'offerCountry',
    pricebasis: 'priceBasis', accessmodel: 'accessModel', billingperiod: 'billingPeriod', pricescope: 'priceScope',
    taxbasis: 'taxBasis', comparisongroup: 'comparisonGroup',
};
const keyOf = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, '');
const alias = (key: string): keyof CourseObservation | undefined => Object.hasOwn(ALIASES, keyOf(key)) ? ALIASES[keyOf(key)] : undefined;
const missing = (value: unknown): boolean => value === null || value === undefined
    || (typeof value === 'string' && /^(?:\s*|n\/?a|null|unknown|--?)$/i.test(value.trim()));
function fail(row: number, message: string): never { throw new InputError('Import row ' + row + ': ' + message, 'INVALID_IMPORT'); }

export function parseCsv(text: string): Row[] {
    if (Buffer.byteLength(text, 'utf8') > MAX_IMPORT_BYTES) throw new InputError('CSV exceeds 2 MiB.', 'INVALID_IMPORT');
    if (text.includes('\0')) throw new InputError('CSV contains an unsupported null character.', 'INVALID_IMPORT');
    text = text.replace(/^\uFEFF/, '');
    const rows: string[][] = [];
    let row: string[] = [], pieces: string[] = [], segmentStart = 0, quoted = false, closed = false;
    const pushField = (end: number): void => {
        if (!closed) pieces.push(text.slice(segmentStart, end));
        row.push(pieces.join('')); pieces = []; closed = false;
    };
    const pushRow = (end: number): void => {
        pushField(end);
        if (row.some((value) => value.trim() !== '')) rows.push(row);
        if (rows.length > MAX_IMPORT_ROWS + 1) throw new InputError('CSV exceeds 1,000 observations.', 'INVALID_IMPORT');
        row = [];
    };
    // Scan delimiters, retaining slices rather than a per-character rope. This
    // bounds the allocation overhead of a near-2 MiB quoted field.
    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (quoted) {
            if (char === '"' && text[index + 1] === '"') {
                pieces.push(text.slice(segmentStart, index), '"'); index += 1; segmentStart = index + 1;
            } else if (char === '"') {
                pieces.push(text.slice(segmentStart, index)); quoted = false; closed = true; segmentStart = index + 1;
            }
        } else if (char === ',') {
            pushField(index); segmentStart = index + 1;
            if (row.length >= 60) throw new InputError('CSV exceeds 60 columns.', 'INVALID_IMPORT');
        } else if (char === '\r' || char === '\n') {
            pushRow(index);
            if (char === '\r' && text[index + 1] === '\n') index += 1;
            segmentStart = index + 1;
        } else if (char === '"') {
            if (index !== segmentStart || pieces.length > 0 || closed) throw new InputError('CSV contains a misplaced quote.', 'INVALID_IMPORT');
            quoted = true; segmentStart = index + 1;
        } else if (closed && char !== ' ' && char !== '\t') {
            throw new InputError('CSV contains text after a closing quote.', 'INVALID_IMPORT');
        }
    }
    if (quoted) throw new InputError('CSV contains an unclosed quoted field.', 'INVALID_IMPORT');
    if (segmentStart < text.length || row.length || pieces.length || closed) pushRow(text.length);
    if (rows.length < 2) throw new InputError('CSV needs a header and an observation.', 'INVALID_IMPORT');
    const headers = rows.shift()!;
    if (headers.length > 60 || headers.some((header) => !header.trim() || header.length > 100)) {
        throw new InputError('CSV needs nonempty headers, maximum 60 columns and 100 characters per header.', 'INVALID_IMPORT');
    }
    const normalized = headers.map((header) => alias(header) ?? keyOf(header));
    if (new Set(normalized).size !== normalized.length) throw new InputError('CSV has duplicate or ambiguous headers.', 'INVALID_IMPORT');
    return rows.map((values, index) => {
        if (values.length !== headers.length) fail(index + 1, 'column count does not match the header.');
        return Object.fromEntries(headers.map((header, position) => [header, values[position]]));
    });
}


function canonical(raw: unknown, row: number, dropped: Set<string>): Row {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(row, 'expected an object.');
    const entries = Object.entries(raw);
    if (entries.length > 60) fail(row, 'maximum 60 columns.');
    const value = Object.create(null) as Row;
    for (const [key, item] of entries) {
        const field = alias(key);
        if (!field) { dropped.add(keyOf(key)); continue; }
        if (Object.hasOwn(value, field)) fail(row, 'multiple columns map to the same field.');
        value[field] = item;
    }
    return value;
}
function text(value: unknown, row: number, field: string, max: number, required = false): string | null {
    if (missing(value)) { if (required) fail(row, field + ' is required.'); return null; }
    if (typeof value !== 'string' || value.length > max) fail(row, field + ' must be text, maximum ' + max + ' characters.');
    const clean = redactText(value);
    if (!clean && required) fail(row, field + ' is required.');
    return clean || null;
}
function numberField(data: Row, row: number, field: string, max: number, integer = false): number | null {
    if (missing(data[field])) return null;
    const value = numeric(data[field], max, integer);
    if (value === null) fail(row, field + ' must be an unambiguous nonnegative number within its documented limit, not a label, range, shorthand or formula.');
    return value;
}
function booleanField(data: Row, row: number, field: string): boolean | null {
    const value = data[field];
    if (missing(value)) return null;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string' && /^(true|false)$/i.test(value.trim())) return value.trim().toLowerCase() === 'true';
    return fail(row, field + ' must be true, false or empty; numeric flags are not inferred.');
}
function option<T extends string>(value: unknown, row: number, field: string, allowed: readonly T[], fallback: T): T {
    if (missing(value)) return fallback;
    if (typeof value !== 'string' || !allowed.includes(value.trim().toLowerCase() as T)) fail(row, 'invalid ' + field + '.');
    return value.trim().toLowerCase() as T;
}
function code(value: unknown, row: number, field: string, length: number): string | null {
    if (missing(value)) return null;
    if (typeof value !== 'string' || !new RegExp('^[A-Za-z]{' + length + '}$').test(value.trim())) fail(row, field + ' needs a ' + length + '-letter code or empty.');
    return value.trim().toUpperCase();
}
function timestamp(value: unknown, row: number, now: Date): string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(value)) {
        fail(row, 'observedAt must be YYYY-MM-DD or a UTC ISO timestamp ending in Z.');
    }
    const parsed = new Date(value.length === 10 ? value + 'T00:00:00Z' : value);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value.slice(0, 10)
        || (value.length > 10 && parsed.toISOString().slice(11, 19) !== value.slice(11, 19))) fail(row, 'observedAt contains an impossible date or time.');
    if (parsed.getTime() > now.getTime()) fail(row, 'observedAt cannot be in the future.');
    return parsed.toISOString();
}
function skillsField(value: unknown, row: number): string[] | null {
    if (missing(value)) return null;
    if (typeof value === 'string') {
        if (value.trim().startsWith('[')) {
            try { value = JSON.parse(value); } catch { fail(row, 'skills JSON list is invalid.'); }
        } else value = value.split('|').map((item) => item.trim());
    }
    try { return textList(value, 'skills').sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase(), 'en')); }
    catch { return fail(row, 'skills needs at most 50 nonempty tags, maximum 80 characters each; CSV uses | separators or a JSON list.'); }
}
export function observationScope(item: CourseObservation): string {
    return JSON.stringify([item.courseId, item.provider, item.courseType, item.language, item.currency,
        item.offerCountry, item.priceBasis, item.accessModel, item.billingPeriod, item.priceScope, item.taxBasis]);
}
function normalizeObservation(raw: unknown, row: number, dropped: Set<string>, now: Date): CourseObservation {
    const data = canonical(raw, row, dropped);
    if (typeof data.courseId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9~:_-]{0,159}$/.test(data.courseId)) {
        fail(row, 'courseId must be a stable 1–160 character STRING using letters, numbers, ~, :, _, or -.');
    }
    const courseUrl = safeCourseUrl(data.courseUrl);
    if (!missing(data.courseUrl) && courseUrl === null) fail(row, 'courseUrl needs an allowlisted HTTPS Coursera catalog URL without credentials or a custom port. No URL is fetched.');
    const difficultyText = text(data.difficulty, row, 'difficulty', 40);
    const difficulty = difficultyText?.toLowerCase() ?? null;
    if (difficulty && !['beginner', 'intermediate', 'advanced', 'mixed'].includes(difficulty)) fail(row, 'invalid difficulty.');
    const priceAmount = numberField(data, row, 'priceAmount', 1_000_000);
    const accessModel = option(data.accessModel, row, 'accessModel', ['one-time', 'subscription', 'free', 'unknown'], 'unknown');
    const billingPeriod = option(data.billingPeriod, row, 'billingPeriod', ['once', 'monthly', 'annual', 'unknown'], 'unknown');
    const priceScope = option(data.priceScope, row, 'priceScope', ['per-learner-course', 'per-learner-catalog', 'unknown'], 'unknown');
    if (accessModel === 'free' && priceAmount !== null && priceAmount !== 0) fail(row, 'free accessModel conflicts with positive priceAmount.');
    if (accessModel === 'subscription' && billingPeriod === 'once') fail(row, 'subscription conflicts with once billingPeriod.');
    if (['one-time', 'free'].includes(accessModel) && ['monthly', 'annual'].includes(billingPeriod)) fail(row, 'one-time/free conflicts with a recurring billingPeriod.');
    const durationHours = numberField(data, row, 'durationHours', 10_000);
    if (durationHours === 0) fail(row, 'durationHours must be positive when supplied; unknown is not zero.');
    return {
        courseId: data.courseId, title: text(data.title, row, 'title', 500, true)!, observedAt: timestamp(data.observedAt, row, now),
        courseUrl, provider: text(data.provider, row, 'provider', 160), courseType: text(data.courseType, row, 'courseType', 80),
        difficulty, skills: skillsField(data.skills, row), language: text(data.language, row, 'language', 80),
        durationHours, durationLabel: text(data.durationLabel, row, 'durationLabel', 160),
        rating: numberField(data, row, 'rating', 5), reviewCount: numberField(data, row, 'reviewCount', 1_000_000_000, true),
        available: booleanField(data, row, 'available'), certificateIncluded: booleanField(data, row, 'certificateIncluded'),
        priceAmount, additionalFeesAmount: numberField(data, row, 'additionalFeesAmount', 1_000_000),
        currency: code(data.currency, row, 'currency', 3), offerCountry: code(data.offerCountry, row, 'offerCountry', 2),
        priceBasis: option(data.priceBasis, row, 'priceBasis', ['standard', 'promotional', 'unknown'], 'unknown'),
        accessModel, billingPeriod, priceScope, taxBasis: option(data.taxBasis, row, 'taxBasis', ['included', 'excluded', 'unknown'], 'unknown'),
        comparisonGroup: text(data.comparisonGroup, row, 'comparisonGroup', 160),
    };
}
export function prepareImport(raw: unknown, now = new Date()): ImportPlan {
    const object = inputObject(raw), input = normalizeInput(raw);
    if (input.mode !== 'import') throw new InputError('Select import for a licensed course export.', 'INVALID_IMPORT');
    if (object.authorizedData !== true) throw new InputError('Confirm authorizedData true only if the export is licensed for this paid analysis service. The declaration does not grant or verify source rights.', 'RIGHTS_CONFIRMATION_REQUIRED');
    if (typeof object.importSource !== 'string' || !object.importSource.trim() || object.importSource.length > 160) throw new InputError('Provide an export provider label as importSource, maximum 160 characters.', 'INVALID_IMPORT');
    const fields = ['importJson', 'importCsv'].filter((key) => object[key] !== undefined && object[key] !== null && object[key] !== '');
    if (fields.length !== 1) throw new InputError('Provide exactly one nonempty importJson or importCsv text. No file or URL is fetched.', 'INVALID_IMPORT');
    const body = object[fields[0]!];
    if (typeof body !== 'string' || Buffer.byteLength(body, 'utf8') > MAX_IMPORT_BYTES) throw new InputError('The pasted export must be text, maximum 2 MiB.', 'INVALID_IMPORT');
    let rows: unknown;
    if (fields[0] === 'importCsv') rows = parseCsv(body);
    else { try { rows = JSON.parse(body); } catch { throw new InputError('importJson needs a valid JSON array of observations.', 'INVALID_IMPORT'); } }
    if (!Array.isArray(rows) || rows.length < 1 || rows.length > MAX_IMPORT_ROWS) throw new InputError('Supply 1–1,000 observation objects.', 'INVALID_IMPORT');
    if (!Number.isFinite(now.getTime())) throw new InputError('Invalid import clock.', 'INVALID_IMPORT');
    const dropped = new Set<string>(), seen = new Map<string, string>(), grouped = new Map<string, CourseObservation[]>();
    let duplicates = 0, count = 0;
    for (const [index, rawRow] of rows.entries()) {
        const item = normalizeObservation(rawRow, index + 1, dropped, now);
        const key = observationScope(item) + ':' + item.observedAt, fingerprint = JSON.stringify(item);
        if (seen.has(key)) {
            if (seen.get(key) !== fingerprint) fail(index + 1, 'conflicting observations for the same course/time/context. Correct the export before any save.');
            duplicates += 1; continue;
        }
        seen.set(key, fingerprint); count += 1;
        const observations = grouped.get(item.courseId) ?? [];
        observations.push(item); grouped.set(item.courseId, observations);
    }
    const dataProvider = redactText(object.importSource);
    const records: CourseAnalysis[] = [...grouped.entries()].slice(0, input.maxResults).map(([courseId, observations]) => {
        observations.sort((a, b) => a.observedAt.localeCompare(b.observedAt) || observationScope(a).localeCompare(observationScope(b)));
        return { recordType: 'authorized-course-analysis', source: 'user-authorized-import', platform: 'coursera', isSynthetic: false,
            courseId, title: observations.at(-1)!.title, dataProvider, importedAt: now.toISOString(), observationCount: observations.length, observations };
    });
    return { records, inputRowCount: rows.length, normalizedObservationCount: count, duplicateObservationsRemoved: duplicates,
        inputCourseCount: grouped.size, selectedCourseCount: records.length, omittedCourseCount: grouped.size - records.length,
        unsupportedColumnsDropped: dropped.size, dataProvider };
}
