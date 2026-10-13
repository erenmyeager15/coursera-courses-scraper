import type { NormalizedInput, ResearchOptions } from './types.js';
import { redactText, skillKey } from './routes.js';

export class InputError extends Error {
    constructor(message: string, readonly code = 'INVALID_INPUT') { super(message); }
}
export function inputObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('Input must be a JSON object.');
    return value as Record<string, unknown>;
}
export function numberOption(object: Record<string, unknown>, key: string, fallback: number, max: number, min = 0, integer = false): number {
    const value = object[key] === undefined ? fallback : object[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
        throw new InputError(`${key} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}.`);
    }
    return value;
}
export function textList(value: unknown, field: string, maxItems = 50): string[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > maxItems || value.some((item) => typeof item !== 'string' || !item.trim() || item.length > 80)) {
        throw new InputError(`${field} must be a list of at most ${maxItems} nonempty text values, maximum 80 characters each.`);
    }
    const seen = new Set<string>();
    return (value as string[]).map(redactText).filter((item) => { const key = skillKey(item); if (!key || seen.has(key)) return false; seen.add(key); return true; });
}
export function researchOptions(object: Record<string, unknown>): ResearchOptions {
    const difficulties = textList(object.targetDifficulties, 'targetDifficulties', 4).map((item) => item.toLowerCase());
    if (difficulties.some((item) => !['beginner', 'intermediate', 'advanced', 'mixed'].includes(item))) throw new InputError('Unknown target difficulty.');
    return {
        requiredSkills: textList(object.requiredSkills, 'requiredSkills'), targetDifficulties: difficulties,
        budgetUsd: object.budgetUsd === undefined || object.budgetUsd === null ? null : numberOption(object, 'budgetUsd', 0, 1_000_000),
        maximumStudyHours: object.maximumStudyHours === undefined || object.maximumStudyHours === null ? null : numberOption(object, 'maximumStudyHours', 0, 10_000, 0.01),
        subscriptionPeriods: numberOption(object, 'subscriptionPeriods', 1, 36, 1, true),
        priceChangeThresholdPercent: numberOption(object, 'priceChangeThresholdPercent', 5, 1000, 0.01),
        comparisonWindowDays: numberOption(object, 'comparisonWindowDays', 90, 3650, 1, true),
    };
}
export function normalizeInput(raw: unknown): NormalizedInput {
    const object = inputObject(raw);
    const legacy = ['queries', 'keyword', 'searchQueries', 'startUrls', 'courseUrls', 'productTypes', 'difficulties', 'includeSkills', 'proxyConfiguration'];
    if (legacy.some((key) => Object.hasOwn(object, key))) throw new InputError(
        'Live Coursera collection is retired in this redesign. Remove search/URL/proxy inputs and select demo for an invented preview, or import for a licensed export. No source request or course-result charge was attempted.', 'LEGACY_INPUT_RETIRED');
    if (object.mode !== 'demo' && object.mode !== 'import') throw new InputError('Select demo or import explicitly. This Actor does not fetch live Coursera courses.');
    const demoPreset = object.demoPreset ?? 'us-skills-comparison';
    if (typeof demoPreset !== 'string' || !['us-skills-comparison', 'us-learning-budget', 'us-catalog-change-review'].includes(demoPreset)) throw new InputError('Unknown synthetic demo preset.');
    return { mode: object.mode, demoPreset: demoPreset as NormalizedInput['demoPreset'],
        maxResults: numberOption(object, 'maxResults', 1, 500, 1, true), research: researchOptions(object) };
}
