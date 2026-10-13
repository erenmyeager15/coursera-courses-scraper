import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeInput } from './input.js';
import { runWorkflow } from './workflow.js';

const root = path.resolve(import.meta.dirname, '..');
const read = (name: string) => fs.readFile(path.join(root, name), 'utf8');
const json = async (name: string) => JSON.parse(await read(name)) as Record<string, any>;
test('manifest preserves identity, numeric pricing and resource defaults while keeping a QA tag', async () => {
    const actor = await json('.actor/actor.json');
    assert.equal(actor.name, 'coursera-courses-scraper'); assert.equal(actor.version, '1.1'); assert.notEqual(actor.buildTag, 'latest');
    assert.deepEqual(actor.defaultRunOptions, { build: 'latest', memoryMbytes: 512, timeoutSecs: 3600 });
    assert.equal(actor.pricingInfo.pricingPerEvent.actorChargeEvents['course-scraped'].eventPriceUsd, 0.002);
    assert.equal(actor.pricingInfo.pricingPerEvent.actorChargeEvents['apify-actor-start'].eventPriceUsd, 0.00005);
});
test('schema requires explicit mode and protects pasted imports as secret inputs', async () => {
    const schema = await json('INPUT_SCHEMA.json');
    assert.deepEqual(schema.required, ['mode']); assert.equal(schema.properties.mode.default, undefined);
    assert.equal(schema.properties.importJson.isSecret, true); assert.equal(schema.properties.importCsv.isSecret, true);
    assert.equal(schema.properties.authorizedData.default, false);
    for (const key of ['queries', 'proxyConfiguration', 'apiKey', 'samApiKey']) assert.equal(schema.properties[key], undefined);
});
test('Store SEO is bounded and clearly states licensed imports, synthetic demos and no live scraping', async () => {
    const copy = await json('release/store-copy.json');
    const actor = await json('.actor/actor.json');
    assert.equal(actor.title, copy.title); assert.equal(copy.seoTitle, copy.title);
    assert((await read('README.md')).startsWith('# ' + copy.title + '\n') || (await read('README.md')).startsWith('# ' + copy.title + '\r\n'));
    assert(copy.title.length <= 80); assert(copy.description.length <= 160); assert(copy.seoTitle.length <= 60); assert(copy.seoDescription.length <= 160);
    assert(copy.description.includes('licensed')); assert(copy.description.toLowerCase().includes('no live scraping'));
    assert(!JSON.stringify(copy).includes('guaranteed profitable'));
});
test('maintenance SEO truthfully separates staging verification from an active release', async () => {
    const copy = await json('release/store-copy.json');
    assert(copy.seoTitle.length >= 40 && copy.seoTitle.length <= 50);
    assert(copy.seoDescription.length >= 140 && copy.seoDescription.length <= 156);
    assert(copy.maintenanceSeoDescription.length >= 140 && copy.maintenanceSeoDescription.length <= 156);
    assert(copy.maintenanceSeoDescription.includes('Under maintenance'));
    assert(copy.maintenanceSeoDescription.includes('release pending'));
    assert(copy.maintenanceSeoDescription.includes('No live scraping'));
});
test('output links exactly match workflow artifacts and the separate import-only dataset', async () => {
    const schema = await json('.actor/output_schema.json');
    const expected = ['RUN_STATUS', 'COURSE_REPORT', 'COURSE_COMPARISON.csv', 'SKILL_GAPS.csv', 'CHANGES.csv', 'QUALITY.csv', 'REPORT.md'];
    const props = Object.values(schema.properties) as { template: string }[];
    for (const key of expected) assert(props.some((item) => item.template.endsWith('/records/' + key)));
    assert.equal(props.filter((item) => item.template.endsWith('/items')).length, 1);
});
test('prepared example pages stay synthetic and never preapprove imported rights', async () => {
    const definition = await json('release/us-examples.json');
    assert.equal(definition.examples.length, 3);
    for (const example of definition.examples) {
        assert(example.title.includes('Synthetic Preview')); assert(example.fixedInputFields.includes('mode'));
        const input = await json(example.inputFile); assert.equal(normalizeInput(input).mode, 'demo');
        assert.equal(input.authorizedData, undefined); assert.equal(input.importSource, undefined);
        const summary = await runWorkflow(input, { canSave: () => { throw Error('Unexpected budget'); },
            save: async () => { throw Error('Unexpected save'); }, write: async () => undefined, status: async () => undefined }, new Date('2026-10-13'));
        assert.equal(summary.courseResultEventCount, 0);
    }
});
test('README quick starts are valid JSON and no off-platform payment/promotion is present', async () => {
    const readme = await read('README.md');
    const matches = [...readme.matchAll(/```json\s+([\s\S]*?)```/g)]; assert.equal(matches.length, 2);
    for (const match of matches) normalizeInput(JSON.parse(match[1]!));
    assert(readme.includes('not a live Coursera scraper')); assert(readme.includes('Profitability'));
    assert(!/paypal|buymeacoffee|patreon|stripe\.com|gumroad/i.test(readme));
});
test('production source has no retired search transport or credential input', async () => {
    for (const name of ['src/main.ts', 'src/routes.ts', 'src/importer.ts', 'src/workflow.ts', 'src/analysis.ts']) {
        const source = await read(name);
        assert(!/\bfetch\s*\(|new ProxyAgent|createProxyConfiguration|scrapeCoursera|__APOLLO_STATE__/.test(source));
    }
    const pkg = await json('package.json'); assert.equal(pkg.dependencies.undici, undefined); assert.equal(pkg.dependencies.playwright, undefined);
    assert.equal(pkg.dependencies.apify, '3.7.2');
});
