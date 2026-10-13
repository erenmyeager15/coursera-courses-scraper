import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { normalizeInput, InputError } from './input.js';
import { prepareImport, parseCsv, MAX_IMPORT_BYTES } from './importer.js';
import { buildReport, comparisonCsv, changesCsv, qualityCsv, skillGapsCsv, enteredCostUsd } from './analysis.js';
import { csv, safeCourseUrl, markdown } from './routes.js';
import { assertDemoInput, demoRows } from './demo-presets.js';
import { runWorkflow, DeliveryError } from './workflow.js';
import { COURSE_EVENT, saveConfirmedCourse, BillingAcknowledgmentError } from './billing.js';
import type { CourseChargingManager } from './billing.js';
import type { Ports } from './workflow.js';

const now = new Date('2026-10-13T12:00:00Z');
const base = { ...demoRows('us-skills-comparison')[0]!, courseId: 'QA-course', title: 'Owner invented course', skills: ['Python', 'SQL'] };
const peer = { ...base, courseId: 'QA-peer', title: 'Owner invented peer', priceAmount: 40, skills: ['Python'] };
const next = { ...base, observedAt: '2026-10-10', priceAmount: 55, durationHours: 15, available: false, skills: ['Python', 'SQL', 'Data analysis'] };
const importInput = (rows: unknown[], extra: Record<string, unknown> = {}) => ({ mode: 'import', authorizedData: true,
    importSource: 'Owner invented QA data — not real Coursera facts', importJson: JSON.stringify(rows), maxResults: 500, ...extra });
function harness(cap = Infinity, ackCount = 1) {
    const rows: unknown[] = [], files = new Map<string, unknown>();
    let checks = 0, saves = 0;
    const ports: Ports = { canSave: () => { checks += 1; return saves < cap; }, save: async (record) => {
        saves += 1; rows.push(record); return { chargedCount: ackCount, eventChargeLimitReached: saves >= cap };
    }, write: async (key, value) => { files.set(key, value); }, status: async () => undefined };
    return { rows, files, ports, counts: () => ({ checks, saves }) };
}

test('explicit mode and strict scenario defaults do not select live or import automatically', () => {
    assert.throws(() => normalizeInput({}), InputError);
    assert.equal(normalizeInput({ mode: 'demo' }).research.budgetUsd, null);
    assert.equal(normalizeInput({ mode: 'import' }).research.maximumStudyHours, null);
});
for (const key of ['queries', 'keyword', 'searchQueries', 'startUrls', 'courseUrls', 'productTypes', 'difficulties', 'includeSkills', 'proxyConfiguration']) {
    test('legacy ' + key + ' rejects before any import/demo save', async () => {
        const h = harness();
        await assert.rejects(runWorkflow({ mode: 'demo', [key]: null }, h.ports, now), (error: unknown) => error instanceof InputError && error.code === 'LEGACY_INPUT_RETIRED');
        assert.deepEqual(h.counts(), { checks: 0, saves: 0 }); assert.equal(h.files.size, 0);
    });
}
for (const key of ['maxResults', 'subscriptionPeriods', 'comparisonWindowDays']) for (const value of [0, -1, 1.2, '1', null, NaN, Infinity]) {
    test(key + ' rejects coerced/nonpositive/noninteger ' + String(value), () => assert.throws(() => normalizeInput({ mode: 'demo', [key]: value }), InputError));
}
for (const key of ['budgetUsd', 'maximumStudyHours', 'priceChangeThresholdPercent']) for (const value of [-1, '25', NaN, Infinity, true]) {
    test(key + ' rejects invalid scenario ' + String(value), () => assert.throws(() => normalizeInput({ mode: 'demo', [key]: value }), InputError));
}
for (const value of [null, 'Python', [1], Array(51).fill('Python'), [''], ['x'.repeat(81)]]) {
    test('bounded requiredSkills ' + JSON.stringify(value).slice(0, 30), () => assert.throws(() => normalizeInput({ mode: 'demo', requiredSkills: value }), InputError));
}
test('skill input exact normalized deduplication does not infer synonyms', () => {
    assert.deepEqual(normalizeInput({ mode: 'demo', requiredSkills: [' SQL ', 'sql', 'Python programming', 'Python'] }).research.requiredSkills,
        ['SQL', 'Python programming', 'Python']);
});
test('demo allows harmless UI false/empty defaults but refuses real import content', () => {
    assertDemoInput({ mode: 'demo', authorizedData: false, importSource: '', importJson: '', importCsv: '' });
    for (const value of [{ authorizedData: true }, { authorizedData: 1 }, { importSource: 'source' }, { importJson: '[]' }, { importCsv: 'id,title' }]) {
        assert.throws(() => assertDemoInput({ mode: 'demo', ...value }), InputError);
    }
});
for (const value of [false, undefined, 'true', 1, null]) {
    test('import rights are explicit ' + String(value), () => assert.throws(() => prepareImport(importInput([base], { authorizedData: value }), now), InputError));
}
for (const extra of [{ importSource: '' }, { importSource: 'x'.repeat(161) }, { importJson: '' }, { importJson: '{}' }, { importJson: 'not-json' },
    { importJson: JSON.stringify([]) }, { importCsv: 'id,title\na,b' }, { importJson: [base] }, { importJson: 'x'.repeat(MAX_IMPORT_BYTES + 1) }]) {
    test('invalid import envelope ' + Object.keys(extra).join(','), () => assert.throws(() => prepareImport(importInput([base], extra), now), InputError));
}
for (const value of [1, '', ' leading', 'credential@email.test', 'x'.repeat(161)]) {
    test('course identifiers retain strict string identity ' + String(value).slice(0, 30), () => assert.throws(() => prepareImport(importInput([{ ...base, courseId: value }]), now), InputError));
}
for (const value of ['2026-02-30', '2026-13-01', '2026-10-13T25:00:00Z', '2026-10-01T00:00:00+00:00', '2026-10-14', 123]) {
    test('invalid/impossible/future observation clock ' + String(value), () => assert.throws(() => prepareImport(importInput([{ ...base, observedAt: value }]), now), InputError));
}
for (const key of ['priceAmount', 'additionalFeesAmount', 'durationHours', 'rating', 'reviewCount']) for (const value of [-1, 'US$5', '5-10', '1,000', '5k', true]) {
    test('strict numeric ' + key + ' ' + String(value), () => assert.throws(() => prepareImport(importInput([{ ...base, [key]: value }]), now), InputError));
}
for (const row of [{ priceAmount: 1_000_001 }, { durationHours: 0 }, { durationHours: 10001 }, { rating: 5.1 }, { reviewCount: 1.5 },
    { accessModel: 'free', priceAmount: 1 }, { accessModel: 'subscription', billingPeriod: 'once' },
    { accessModel: 'one-time', billingPeriod: 'monthly' }, { available: 1 }, { certificateIncluded: 'yes' }, { currency: '$' },
    { offerCountry: 'United States' }, { difficulty: 'expert' }]) {
    test('domain conflict ' + JSON.stringify(row), () => assert.throws(() => prepareImport(importInput([{ ...base, ...row }]), now), InputError));
}
for (const url of ['http://www.coursera.org/learn/python', 'https://coursera.org.evil.test/learn/python', 'https://127.0.0.1/learn/python',
    'https://user:secret@coursera.org/learn/python', 'https://coursera.org:8443/learn/python', 'javascript:alert(1)', 'file:///data',
    '//coursera.org/learn/python', 'https://coursera.org/search?query=python', 'https://coursera.org/account', 'https://coursera.org/learn/../account',
    'https://www.coursera.org\\@evil.test/learn/python']) {
    test('unsafe/noncatalog URL ' + url, () => { assert.equal(safeCourseUrl(url), null); assert.throws(() => prepareImport(importInput([{ ...base, courseUrl: url }]), now), InputError); });
}
test('safe course links are canonicalized but never requested', () => {
    assert.equal(safeCourseUrl('https://coursera.org/learn/python/?tracking=secret#detail'), 'https://www.coursera.org/learn/python');
});
test('duplicates deduplicate; same course/time/context conflict rejects even beyond selected cap', () => {
    const plan = prepareImport(importInput([base, { ...base }]), now);
    assert.equal(plan.duplicateObservationsRemoved, 1); assert.equal(plan.records.length, 1);
    assert.throws(() => prepareImport(importInput([base, peer, { ...peer, title: 'conflicting' }], { maxResults: 1 }), now), InputError);
});
test('unknown columns are dropped without leaking passwords, learner data or inherited keys', () => {
    const row = JSON.parse(JSON.stringify({ ...base, password: 'DO_NOT_EXPORT', learnerEmail: 'private@example.test', '__proto__': { token: 'DO_NOT_EXPORT' } }));
    const plan = prepareImport(importInput([row]), now);
    assert.equal(plan.unsupportedColumnsDropped, 2); assert(!JSON.stringify(plan.records).includes('DO_NOT_EXPORT'));
    assert(!JSON.stringify(plan.records).includes('private@example.test'));
});
for (const body of ['id,id\na,b', 'id,courseId\na,b', 'id,title\na', 'id,title\na,b,c', 'id,title\n"a,b', 'id,title\na,"b"bad',
    'id,title\na,b"c', 'id,title\na,b\u0000', Array(61).fill('x').join(',') + '\n' + Array(61).fill('x').join(',')]) {
    test('malformed/ambiguous CSV ' + body.slice(0, 25), () => assert.throws(() => parseCsv(body), InputError));
}
test('quoted CSV roundtrips multiline/quotes, numeric strings and | skill tags', () => {
    const keys = Object.keys(base), body = csv(keys, [keys.map((key) => key === 'skills' ? 'Python | SQL' : (base as Record<string, unknown>)[key])]);
    const plan = prepareImport({ mode: 'import', authorizedData: true, importSource: 'Owner CSV QA', importCsv: '\uFEFF' + body }, now);
    assert.equal(plan.records.length, 1); assert.deepEqual(plan.records[0]!.observations[0]!.skills, ['Python', 'SQL']);
    assert.equal(parseCsv('id,title\n"a","two\nlines and ""quotes"""')[0]!.title, 'two\nlines and "quotes"');
});
test('1001 observations and >60 row fields reject before selection', () => {
    assert.throws(() => prepareImport(importInput(Array(1001).fill(base)), now), InputError);
    assert.throws(() => prepareImport(importInput([{ ...base, ...Object.fromEntries(Array.from({ length: 61 }, (_, n) => ['field' + n, n])) }]), now), InputError);
});
test('whole-course cap retains observations without exporting/billing omitted courses', () => {
    const plan = prepareImport(importInput([base, peer, next], { maxResults: 1 }), now);
    assert.equal(plan.records.length, 1); assert.equal(plan.records[0]!.observationCount, 2); assert.equal(plan.omittedCourseCount, 1);
});
function analyze(rows: unknown[], extra: Record<string, unknown> = {}) {
    const raw = importInput(rows, extra); return buildReport(prepareImport(raw, now).records, normalizeInput(raw).research);
}
test('exact skill coverage identifies supplied/missing tags without treating unknown as zero', () => {
    const report = analyze([base, { ...peer, skills: null }], { requiredSkills: ['python', 'SQL', 'Python programming'] });
    assert.equal(report.courses[0]!.skillCoveragePercent, 66.67);
    assert.deepEqual(report.courses[0]!.missingSkills, ['Python programming']);
    assert.equal(report.courses[1]!.skillCoveragePercent, null); assert.deepEqual(report.courses[1]!.missingSkills, []);
    assert(skillGapsCsv(report).includes('unknown'));
});
test('missing hours do not convert month duration labels into a study-hours claim', () => {
    const item = analyze([{ ...base, durationHours: null, durationLabel: '1-3 months' }], { maximumStudyHours: 50 }).courses[0]!;
    assert.equal(item.durationHours, null); assert.equal(item.withinStudyHours, null); assert.equal(item.reviewAction, 'incomplete_evidence');
});
for (const [key, value] of Object.entries({ priceAmount: null, additionalFeesAmount: null, currency: null, offerCountry: null,
    priceBasis: 'unknown', accessModel: 'unknown', billingPeriod: 'unknown', priceScope: 'unknown', taxBasis: 'unknown' })) {
    test('missing cost context is unknown, never assumed zero ' + key, () => {
        const report = analyze([{ ...base, [key]: value }], { budgetUsd: 100 });
        assert.equal(report.courses[0]!.enteredCostUsd, null); assert.equal(report.courses[0]!.withinBudget, null);
    });
}
for (const row of [{ currency: 'EUR' }, { offerCountry: 'GB' }, { priceBasis: 'promotional' }]) {
    test('US budget does not relabel/convert/promote ' + JSON.stringify(row), () => assert.equal(analyze([{ ...base, ...row }], { budgetUsd: 100 }).courses[0]!.enteredCostUsd, null));
}
test('subscription scenario separates time/scope and does not infer completion or duplicate total', () => {
    const item = analyze([{ ...base, priceAmount: 19, accessModel: 'subscription', billingPeriod: 'monthly', priceScope: 'per-learner-catalog' }],
        { budgetUsd: 60, subscriptionPeriods: 3 }).courses[0]!;
    assert.equal(item.enteredCostUsd, 57); assert.equal(item.withinBudget, true); assert.equal(item.periods, 3);
    assert(item.warnings.some((value) => value.includes('not a per-course')));
});
test('decimal subscription multiplication preserves an exact budget boundary', () => {
    const item = analyze([{ ...base, priceAmount: 20.1, accessModel: 'subscription', billingPeriod: 'monthly' }],
        { budgetUsd: 60.3, subscriptionPeriods: 3 }).courses[0]!;
    assert.equal(item.enteredCostUsd, 60.3); assert.equal(item.withinBudget, true);
});
test('empty supplied skill tags mean known empty, not unknown', () => {
    const item = analyze([{ ...base, skills: [] }], { requiredSkills: ['Python'] }).courses[0]!;
    assert.equal(item.skillCoveragePercent, 0); assert.deepEqual(item.missingSkills, ['Python']);
});
test('own prototype-named CSV/JSON fields are dropped without prototype pollution', () => {
    const row = Object.fromEntries([...Object.entries(base), ['__proto__', { contaminated: true }], ['constructor', 'SECRET']]);
    const plan = prepareImport(importInput([row]), now);
    assert.equal(plan.unsupportedColumnsDropped, 2); assert(!JSON.stringify(plan.records).includes('contaminated'));
    assert.equal(({} as Record<string, unknown>).contaminated, undefined);
});
test('CSV slice parser roundtrips escaped quotes, empty cells, delimiters and quoted whitespace', () => {
    const values = ['plain', 'two,parts', 'two\r\nlines', 'a"b"c', '', ' spaced ', '""""', '=1+2'];
    const body = csv(values.map((_, index) => 'field' + index), [values]);
    const parsed = parseCsv(body)[0]!;
    values.forEach((value, index) => assert.equal(parsed['field' + index], value === '=1+2' ? "'=1+2" : value));
    assert.equal(parseCsv('id,title\r\na,"quoted"  \r\n')[0]!.title, 'quoted');
});
test('local non-PPE save retains output without inventing paid custom events', async () => {
    const manager: CourseChargingManager = { getPricingInfo: () => ({ isPayPerEvent: false, perEventPrices: {} }),
        getChargedEventCount: () => 0, calculateMaxEventChargeCountWithinLimit: () => Infinity };
    assert.deepEqual(await saveConfirmedCourse({}, { manager, push: async () => ({ chargedCount: 0, eventChargeLimitReached: false }) }),
        { chargedCount: 0, eventChargeLimitReached: false });
});
test('decimal exact 5% threshold is not missed, near-threshold value is not rounded into alert', () => {
    assert.equal(analyze([{ ...base, priceAmount: 9 }, { ...next, priceAmount: 9.45 }]).changes.filter((item) => item.field === 'priceAmount').length, 1);
    assert.equal(analyze([{ ...base, priceAmount: 9 }, { ...next, priceAmount: 9.449999 }]).changes.filter((item) => item.field === 'priceAmount').length, 0);
});
for (const row of [{ currency: 'EUR' }, { offerCountry: 'GB' }, { priceBasis: 'promotional' }, { taxBasis: 'excluded' },
    { language: 'French' }, { provider: 'Different provider' }, { courseType: 'SPECIALIZATION' },
    { accessModel: 'subscription', billingPeriod: 'monthly' }, { priceScope: 'per-learner-catalog' }]) {
    test('context-separated observations do not become numeric price alerts ' + JSON.stringify(row), () => {
        assert.equal(analyze([base, { ...next, ...row }]).changes.filter((item) => item.field === 'priceAmount').length, 0);
    });
}
test('long gaps and zero baselines do not create false changes', () => {
    const report = analyze([base, { ...next, observedAt: '2026-10-12' }], { comparisonWindowDays: 1 });
    assert.equal(report.changes.length, 1); assert.equal(report.changes[0]!.type, 'comparison_gap');
    assert.equal(analyze([{ ...base, priceAmount: 0 }, next]).changes.filter((item) => item.field === 'priceAmount').length, 0);
});
test('field comparison retains raw supplied evidence and unknowns do not erase prior values', () => {
    const report = analyze([base, next]); assert(report.changes.some((item) => item.field === 'available' && item.current === false));
    assert(!analyze([base, { ...next, skills: null, durationHours: null }]).changes.some((item) => ['skills', 'durationHours'].includes(item.field)));
});
test('peer ranks use exact time/context and raw costs with honest ties', () => {
    const report = analyze([base, { ...peer, priceAmount: 50 }, { ...peer, courseId: 'QA-low', priceAmount: 40 }]);
    assert.deepEqual(report.courses.map((item) => item.peerCostRank), [2, 2, 1]);
    assert(report.courses.every((item) => item.peerCourseCount === 3));
});
for (const row of [{ comparisonGroup: null }, { observedAt: '2026-10-02' }, { language: 'French' },
    { courseType: 'SPECIALIZATION' }, { priceBasis: 'promotional' }, { additionalFeesAmount: null }]) {
    test('rank is withheld for unmatched peer ' + JSON.stringify(row), () => assert(analyze([base, { ...peer, ...row }]).courses.every((item) => item.peerCostRank === null)));
}
test('multiple provider quotes for the same course cannot multiply the cohort ranking', () => {
    const report = analyze([base, { ...base, provider: 'Other provider', priceAmount: 1 }, peer]);
    assert(report.courses.every((item) => item.peerCostRank === null));
});
test('formula-safe CSV/escaped Markdown and text redaction do not expose executable markup', () => {
    const report = analyze([{ ...base, title: '=IMPORTXML("secret") <script>bad</script> person@example.test' }]);
    assert(comparisonCsv(report).includes("'=IMPORTXML")); assert(!JSON.stringify(report).includes('person@example.test'));
    assert(!markdown('<script>').includes('<script>')); assert(changesCsv(report).includes('AUTHORIZED IMPORT'));
    assert(qualityCsv(report).startsWith('"provenance')); assert(enteredCostUsd(prepareImport(importInput([base]), now).records[0]!.observations[0]!, normalizeInput({ mode: 'demo' }).research) === 50);
});
test('full workflow saves once per course and delivers seven artifacts, no history or source calls', async () => {
    const h = harness(), summary = await runWorkflow(importInput([base, next, peer]), h.ports, now);
    assert.equal(h.rows.length, 2); assert.equal(h.files.size, 7); assert.equal(summary.savedCourseCount, 2);
    assert.equal(summary.courseResultEventCount, 2); assert.equal(summary.savedObservationCount, 3); assert.equal(summary.completeSelectedOutput, true);
    assert.equal(summary.upstreamRequestCount, 0); assert.equal(summary.persistentHistoryWritten, false);
});
test('exact final-row cap is complete; real partial output contains saved courses only', async () => {
    const exact = harness(2), summary = await runWorkflow(importInput([base, peer]), exact.ports, now);
    assert.equal(summary.outcome, 'succeeded'); assert.equal(summary.spendingLimitReached, true);
    const partial = harness(1), limited = await runWorkflow(importInput([base, peer]), partial.ports, now);
    assert.equal(limited.outcome, 'stopped_spending_limit'); assert.equal(limited.completeSelectedOutput, false);
    assert(!JSON.stringify(partial.files.get('COURSE_REPORT')).includes('QA-peer'));
});
test('zero cap produces no result saves/fees and no unbilled course disclosure', async () => {
    const h = harness(0), summary = await runWorkflow(importInput([base]), h.ports, now);
    assert.equal(summary.savedCourseCount, 0); assert.equal(summary.courseResultEventCount, 0);
    assert(!JSON.stringify(h.files.get('COURSE_REPORT')).includes('QA-course'));
});
test('invalid row after the selected cap rejects before canSave', async () => {
    const h = harness(); await assert.rejects(runWorkflow(importInput([base, { ...peer, rating: 9 }], { maxResults: 1 }), h.ports, now), InputError);
    assert.deepEqual(h.counts(), { checks: 0, saves: 0 });
});
test('uncertain save and report failure never trigger another workflow dataset write or leak error details', async () => {
    const h = harness(); let attempts = 0;
    h.ports.save = async () => { attempts += 1; throw new Error('TOKEN=DO_NOT_EXPORT'); };
    await assert.rejects(runWorkflow(importInput([base, peer]), h.ports, now), DeliveryError);
    assert.equal(attempts, 1); assert(!JSON.stringify([...h.files.values()]).includes('DO_NOT_EXPORT'));
    assert.equal((h.files.get('RUN_STATUS') as Record<string, unknown>).unconfirmedDeliveryAttempt, true);
    const r = harness(); r.ports.write = async (key) => { if (key !== 'RUN_STATUS') throw new Error('SECRET'); };
    await assert.rejects(runWorkflow(importInput([base]), r.ports, now), DeliveryError); assert.equal(r.counts().saves, 1);
});
for (const preset of ['us-skills-comparison', 'us-learning-budget', 'us-catalog-change-review'] as const) {
    test('synthetic ' + preset + ' is clearly labeled with no budget/save/result calls', async () => {
        const h = harness(0), summary = await runWorkflow({ mode: 'demo', demoPreset: preset, requiredSkills: ['Python', 'SQL'] }, h.ports, now);
        assert.deepEqual(h.counts(), { checks: 0, saves: 0 }); assert.equal(summary.isSynthetic, true);
        assert.equal(summary.savedCourseCount, 0); assert.equal(summary.courseResultEventCount, 0); assert.equal(h.files.size, 7);
        for (const value of h.files.values()) assert(JSON.stringify(value).includes('SYNTHETIC DEMO'));
    });
}
for (const delta of [-1, 0, 2]) test('custom billing counter delta ' + delta + ' fails without save retry', async () => {
    let counter = 1, calls = 0;
    const manager: CourseChargingManager = { getPricingInfo: () => ({ isPayPerEvent: true, perEventPrices: { [COURSE_EVENT]: 0.002 } }),
        getChargedEventCount: () => counter, calculateMaxEventChargeCountWithinLimit: () => 1 };
    await assert.rejects(saveConfirmedCourse({}, { manager, push: async () => { calls += 1; counter += delta; return { chargedCount: 2, eventChargeLimitReached: false }; } }), BillingAcknowledgmentError);
    assert.equal(calls, 1);
});
for (const prices of [{}, { [COURSE_EVENT]: 0 }, { [COURSE_EVENT]: NaN }, { [COURSE_EVENT]: 0.002, 'apify-default-dataset-item': 0.001 }]) {
    test('invalid/double result pricing blocks before save ' + JSON.stringify(prices), async () => {
        let calls = 0;
        const manager: CourseChargingManager = { getPricingInfo: () => ({ isPayPerEvent: true, perEventPrices: prices }),
            getChargedEventCount: () => 0, calculateMaxEventChargeCountWithinLimit: () => 1 };
        await assert.rejects(saveConfirmedCourse({}, { manager, push: async () => { calls += 1; return { chargedCount: 1, eventChargeLimitReached: false }; } }), BillingAcknowledgmentError);
        assert.equal(calls, 0);
    });
}
const require = createRequire(import.meta.url);
const { ChargingManager, pushDataAndCharge } = require(path.join(path.dirname(require.resolve('apify')), 'charging.js'));
for (const startFee of [0.00005, 0.001]) for (const scenario of [
    { limit: 1, maxResults: 1, complete: true },
    { limit: 2, maxResults: 2, complete: true },
    { limit: 1, maxResults: 2, complete: false },
]) test('installed SDK start=' + startFee + ' cap=' + scenario.limit + ' selected=' + scenario.maxResults + ' stays exact offline', async () => {
    const { limit, maxResults, complete } = scenario;
    const charges: { eventName: string; count: number }[] = [], rows: unknown[] = [], files = new Map<string, unknown>();
    const config: Record<string, unknown> = { isAtHome: true, actorRunId: 'offline-fixture', maxTotalChargeUsd: startFee + limit * 0.002,
        actorPricingInfo: JSON.stringify({ pricingModel: 'PAY_PER_EVENT', pricingPerEvent: { actorChargeEvents: {
            [COURSE_EVENT]: { eventPriceUsd: 0.002, eventTitle: 'Course' }, 'apify-actor-start': { eventPriceUsd: startFee, eventTitle: 'Start' },
        } } }), chargedEventCounts: JSON.stringify({ 'apify-actor-start': 1 }), useChargingLogDataset: false };
    const manager = new ChargingManager({ get: (key: string) => config[key] }, { run: () => ({ charge: async (value: { eventName: string; count: number }) => { charges.push(value); } }) });
    await manager.init(); const rawCounts: number[] = [];
    const summary = await runWorkflow(importInput([base, next, peer], { maxResults }), {
        canSave: () => manager.calculateMaxEventChargeCountWithinLimit(COURSE_EVENT) > 0,
        save: (record) => saveConfirmedCourse(record, { manager, push: async (value, eventName) => {
            const result = await pushDataAndCharge({ chargingManager: manager, items: value, eventName, isDefaultDataset: true,
                pushFn: async (item: unknown) => { rows.push(item); } }); rawCounts.push(result.chargedCount); return result;
        } }), write: async (key, value) => { files.set(key, value); }, status: async () => undefined,
    }, now);
    assert.deepEqual(rawCounts, Array(limit).fill(2)); assert.equal(rows.length, limit); assert.equal(charges.length, limit);
    assert(charges.every((value) => value.eventName === COURSE_EVENT && value.count === 1));
    assert.equal(summary.courseResultEventCount, limit); assert.equal(summary.completeSelectedOutput, complete);
    assert.equal(summary.outcome, complete ? 'succeeded' : 'stopped_spending_limit');
    if (!complete) assert(!JSON.stringify(files.get('COURSE_REPORT')).includes('QA-peer'));
});
