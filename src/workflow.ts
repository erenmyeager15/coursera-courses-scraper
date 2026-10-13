import { normalizeInput } from './input.js';
import { prepareImport } from './importer.js';
import { assertDemoInput, demoRows } from './demo-presets.js';
import { buildReport, comparisonCsv, skillGapsCsv, changesCsv, qualityCsv, reportMarkdown } from './analysis.js';
import type { CourseAnalysis, ChargeResultLike } from './types.js';

export interface Ports {
    canSave(): boolean;
    save(record: CourseAnalysis & { singleCourseAnalysis: ReturnType<typeof buildReport> }): Promise<ChargeResultLike>;
    write(key: string, value: unknown, contentType?: string): Promise<void>;
    status(message: string): Promise<void>;
}
export class DeliveryError extends Error { readonly code = 'DELIVERY_FAILED'; }
export async function runWorkflow(raw: unknown, ports: Ports, now = new Date()): Promise<Record<string, unknown>> {
    const input = normalizeInput(raw), isDemo = input.mode === 'demo';
    if (isDemo) assertDemoInput(raw);
    const plan = prepareImport(isDemo ? { mode: 'import', authorizedData: true,
        importSource: 'SYNTHETIC DEMO — invented facts, not Coursera course measurements',
        importJson: JSON.stringify(demoRows(input.demoPreset)), maxResults: 3 } : raw, now);
    const records: CourseAnalysis[] = isDemo ? plan.records.map((record) => ({ ...record, recordType: 'synthetic-course-preview',
        source: 'synthetic-demo', isSynthetic: true, observations: record.observations.map((item) => ({ ...item, courseUrl: null })) })) : plan.records;
    const saved: CourseAnalysis[] = [];
    let stopped = false, saveFailed = false, chargedCourseEvents = 0;
    if (!isDemo) for (const record of records) {
        try {
            if (!ports.canSave()) { stopped = true; break; }
            const result = await ports.save({ ...record, singleCourseAnalysis: buildReport([record], input.research) });
            if (!result || ![0, 1].includes(result.chargedCount) || typeof result.eventChargeLimitReached !== 'boolean') throw new DeliveryError('Unknown acknowledgment.');
            if (result.chargedCount === 1 || !result.eventChargeLimitReached) saved.push(record);
            chargedCourseEvents += result.chargedCount;
            if (result.eventChargeLimitReached) { stopped = true; break; }
        } catch { saveFailed = true; break; }
    }
    const delivered = isDemo ? records : saved, report = buildReport(delivered, input.research, isDemo);
    const summary = {
        mode: input.mode, source: isDemo ? 'synthetic-demo' : 'user-authorized-import', isSynthetic: isDemo,
        label: report.label, outcome: saveFailed ? 'failed_delivery' : isDemo ? 'demo_complete'
            : stopped && saved.length < plan.selectedCourseCount ? 'stopped_spending_limit' : 'succeeded',
        demoPreset: isDemo ? input.demoPreset : null, dataProvider: plan.dataProvider,
        spendingLimitReached: stopped, completeSelectedOutput: isDemo || (!saveFailed && saved.length === plan.selectedCourseCount),
        savedCourseCount: saved.length, savedObservationCount: saved.reduce((sum, record) => sum + record.observationCount, 0),
        courseResultEventCount: chargedCourseEvents, previewCourseCount: isDemo ? records.length : 0,
        previewObservationCount: isDemo ? report.observationCount : 0,
        unsavedSelectedCourseCount: isDemo ? 0 : plan.selectedCourseCount - saved.length,
        inputRowCount: isDemo ? 0 : plan.inputRowCount, normalizedObservationCount: isDemo ? 0 : plan.normalizedObservationCount,
        duplicateObservationsRemoved: isDemo ? 0 : plan.duplicateObservationsRemoved,
        selectedCourseCount: isDemo ? 0 : plan.selectedCourseCount, omittedCourseCount: isDemo ? 0 : plan.omittedCourseCount,
        unsupportedColumnsDropped: isDemo ? 0 : plan.unsupportedColumnsDropped,
        upstreamRequestCount: 0, liveSourceVerified: false, sourceRightsVerified: false, persistentHistoryWritten: false,
        reportsComplete: !saveFailed, unconfirmedDeliveryAttempt: saveFailed,
        unconfirmedDeliveryNotice: saveFailed ? 'An attempted save may already have persisted and billed a course. Inspect dataset/platform billing; no workflow save retry was attempted.' : null,
        resultEventCountSource: 'Confirmed custom course counters; not final settled platform billing.',
        chargeNotice: isDemo ? 'No course-result events or dataset rows. Actor Start and platform usage still apply.'
            : 'One course-result event per successfully saved unique course analysis, including supplied observations. Start/platform usage follow the Actor pricing policy.',
    };
    try {
        await ports.write('COURSE_REPORT', { summary, records: delivered, analysis: report });
        await ports.write('COURSE_COMPARISON.csv', comparisonCsv(report), 'text/csv; charset=utf-8');
        await ports.write('SKILL_GAPS.csv', skillGapsCsv(report), 'text/csv; charset=utf-8');
        await ports.write('CHANGES.csv', changesCsv(report), 'text/csv; charset=utf-8');
        await ports.write('QUALITY.csv', qualityCsv(report), 'text/csv; charset=utf-8');
        await ports.write('REPORT.md', reportMarkdown(report), 'text/markdown; charset=utf-8');
        await ports.write('RUN_STATUS', summary);
    } catch {
        await ports.write('RUN_STATUS', { ...summary, outcome: 'failed_delivery', reportsComplete: false }).catch(() => undefined);
        throw new DeliveryError('Report delivery failed. Existing saved course analyses retain their charges; no extra course saves were attempted.');
    }
    if (saveFailed) throw new DeliveryError('Course delivery was not confirmed. An attempted save may already have persisted and billed a course; inspect dataset/platform billing. No workflow save retry was attempted.');
    await ports.status(isDemo ? 'Synthetic demo complete: zero dataset rows/course-result events. Start/platform usage apply; no Coursera request.'
        : `Import ${summary.outcome}: ${saved.length} saved course analyses. No live source lookup or cross-run history.`);
    return summary;
}
