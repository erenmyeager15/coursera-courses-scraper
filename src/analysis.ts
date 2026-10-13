import { observationScope } from './importer.js';
import { changeMeetsThreshold, exactSum, exactProduct } from './decimal.js';
import { csv, markdown, round, skillKey } from './routes.js';
import type { CourseAnalysis, CourseObservation, ResearchOptions } from './types.js';

export interface CourseAssessment {
    courseId: string; title: string; isSynthetic: boolean; source: string; dataProvider: string;
    observedAt: string; courseUrl: string | null; provider: string | null; courseType: string | null;
    difficulty: string | null; language: string | null; matchedSkills: string[]; missingSkills: string[];
    skillCoveragePercent: number | null; difficultyMatches: boolean | null;
    durationHours: number | null; durationLabel: string | null; withinStudyHours: boolean | null;
    enteredCostUsd: number | null; billingPeriod: string; priceScope: string; periods: number;
    withinBudget: boolean | null; available: boolean | null; certificateIncluded: boolean | null;
    rating: number | null; reviewCount: number | null; reviewAction: string;
    peerCostRank: number | null; peerCourseCount: number | null; warnings: string[];
    observation: CourseObservation;
}
export interface ChangeFinding {
    courseId: string; title: string; isSynthetic: boolean; source: string; dataProvider: string;
    type: string; field: string; previous: unknown; current: unknown; previousObservedAt: string;
    observedAt: string; changePercent: number | null; note: string;
}
export interface CourseReport {
    label: string; source: string; isSynthetic: boolean; courseCount: number; observationCount: number;
    assumptions: ResearchOptions; courses: CourseAssessment[]; changes: ChangeFinding[];
    limits: string[];
}
export function priceContextComplete(item: CourseObservation): boolean {
    return item.priceAmount !== null && item.additionalFeesAmount !== null && item.currency !== null && item.offerCountry !== null
        && item.priceBasis === 'standard' && item.accessModel !== 'unknown' && item.billingPeriod !== 'unknown'
        && item.priceScope !== 'unknown' && item.taxBasis !== 'unknown';
}
export function enteredCostUsd(item: CourseObservation, research: ResearchOptions): number | null {
    if (!priceContextComplete(item) || item.currency !== 'USD' || item.offerCountry !== 'US') return null;
    // Periods are a caller scenario, not a completion-time estimate or team licence.
    return exactProduct(exactSum(item.priceAmount!, item.additionalFeesAmount!), item.accessModel === 'subscription' ? research.subscriptionPeriods : 1);
}
function assessment(record: CourseAnalysis, item: CourseObservation, research: ResearchOptions): CourseAssessment {
    const known = item.skills === null ? null : new Set(item.skills.map(skillKey));
    const matchedSkills = known === null ? [] : research.requiredSkills.filter((skill) => known.has(skillKey(skill)));
    const missingSkills = known === null ? [] : research.requiredSkills.filter((skill) => !known.has(skillKey(skill)));
    const cost = enteredCostUsd(item, research), warnings: string[] = [];
    if (item.skills === null) warnings.push('Skill tags missing; missingSkills is unknown, not an empty gap list.');
    if (item.durationHours === null) warnings.push('Study hours missing; duration labels are not converted into hours.');
    if (cost === null) warnings.push('US/USD standard cost context incomplete or not applicable; no budget conclusion.');
    if (item.accessModel === 'subscription') warnings.push('Subscription periods are entered assumptions; completing this course or obtaining a certificate within them is not guaranteed.');
    if (item.priceScope === 'per-learner-catalog') warnings.push('Catalog access price is not a per-course tuition price and must not be added once per catalog course.');
    if (item.available === null) warnings.push('Availability unknown; no enrollment or completion claim.');
    if (item.certificateIncluded === null) warnings.push('Certificate inclusion unknown; no credential equivalence or accreditation claim.');
    if (item.provider === null || item.courseType === null) warnings.push('Provider/course type incomplete; check catalog identity manually.');
    const withinBudget = research.budgetUsd === null || cost === null ? null : cost <= research.budgetUsd;
    const withinStudyHours = research.maximumStudyHours === null || item.durationHours === null ? null : item.durationHours <= research.maximumStudyHours;
    const difficultyMatches = research.targetDifficulties.length === 0 || item.difficulty === null ? null : research.targetDifficulties.includes(item.difficulty);
    const incomplete = (research.requiredSkills.length > 0 && known === null) || (research.budgetUsd !== null && cost === null)
        || (research.maximumStudyHours !== null && item.durationHours === null) || (research.targetDifficulties.length > 0 && item.difficulty === null);
    const outside = withinBudget === false || withinStudyHours === false || difficultyMatches === false || item.available === false || missingSkills.length > 0;
    return {
        courseId: record.courseId, title: item.title, isSynthetic: record.isSynthetic, source: record.source, dataProvider: record.dataProvider,
        observedAt: item.observedAt, courseUrl: item.courseUrl, provider: item.provider, courseType: item.courseType,
        difficulty: item.difficulty, language: item.language, matchedSkills, missingSkills,
        skillCoveragePercent: research.requiredSkills.length === 0 || known === null ? null : round(matchedSkills.length / research.requiredSkills.length * 100),
        difficultyMatches, durationHours: item.durationHours, durationLabel: item.durationLabel, withinStudyHours,
        enteredCostUsd: cost, billingPeriod: item.billingPeriod, priceScope: item.priceScope,
        periods: item.accessModel === 'subscription' ? research.subscriptionPeriods : 1, withinBudget,
        available: item.available, certificateIncluded: item.certificateIncluded, rating: item.rating, reviewCount: item.reviewCount,
        reviewAction: outside ? 'outside_entered_criteria' : incomplete ? 'incomplete_evidence' : 'review_supplied_evidence',
        peerCostRank: null, peerCourseCount: null, warnings, observation: item,
    };
}
function latestContexts(record: CourseAnalysis): CourseObservation[] {
    const latest = new Map<string, CourseObservation>();
    for (const item of record.observations) {
        const scope = observationScope(item), previous = latest.get(scope);
        if (!previous || item.observedAt > previous.observedAt) latest.set(scope, item);
    }
    return [...latest.values()];
}
function findings(record: CourseAnalysis, research: ResearchOptions): ChangeFinding[] {
    const groups = new Map<string, CourseObservation[]>(), result: ChangeFinding[] = [];
    for (const item of record.observations) {
        const scope = observationScope(item), group = groups.get(scope) ?? [];
        group.push(item); groups.set(scope, group);
    }
    for (const group of groups.values()) {
        group.sort((a, b) => a.observedAt.localeCompare(b.observedAt));
        const current = group.at(-1), previous = group.at(-2);
        if (!current || !previous) continue;
        const base = { courseId: record.courseId, title: current.title, isSynthetic: record.isSynthetic,
            source: record.source, dataProvider: record.dataProvider, previousObservedAt: previous.observedAt, observedAt: current.observedAt };
        if (Date.parse(current.observedAt) - Date.parse(previous.observedAt) > research.comparisonWindowDays * 86_400_000) {
            result.push({ ...base, type: 'comparison_gap', field: 'observedAt', previous: previous.observedAt, current: current.observedAt,
                changePercent: null, note: 'Latest supplied pair exceeds the comparison window; no price/metadata change alert.' });
            continue;
        }
        if (priceContextComplete(previous) && priceContextComplete(current) && previous.priceAmount! > 0
            && changeMeetsThreshold(current.priceAmount!, previous.priceAmount!, research.priceChangeThresholdPercent, true)) {
            result.push({ ...base, type: current.priceAmount! > previous.priceAmount! ? 'quoted_price_increased' : 'quoted_price_decreased',
                field: 'priceAmount', previous: previous.priceAmount, current: current.priceAmount,
                changePercent: (current.priceAmount! - previous.priceAmount!) / previous.priceAmount! * 100,
                note: 'Matching supplied standard offer context only; not a current price or inflation forecast.' });
        }
        for (const field of ['title', 'difficulty', 'durationHours', 'durationLabel', 'skills', 'rating', 'reviewCount', 'available', 'certificateIncluded', 'additionalFeesAmount'] as const) {
            if (previous[field] === null || current[field] === null || JSON.stringify(previous[field]) === JSON.stringify(current[field])) continue;
            result.push({ ...base, type: 'supplied_field_changed', field, previous: previous[field], current: current[field],
                changePercent: null, note: 'Changed supplied values in matching context; no automatic refresh or outcome prediction.' });
        }
    }
    return result;
}
function rankPeers(courses: CourseAssessment[]): void {
    const groups = new Map<string, CourseAssessment[]>();
    for (const course of courses) {
        const item = course.observation;
        if (course.enteredCostUsd === null || !item.comparisonGroup || !item.courseType || !item.language) continue;
        const key = JSON.stringify([item.comparisonGroup, item.observedAt, item.courseType, item.language, item.currency,
            item.offerCountry, item.accessModel, item.billingPeriod, item.priceScope, item.taxBasis]);
        const group = groups.get(key) ?? []; group.push(course); groups.set(key, group);
    }
    for (const group of groups.values()) {
        if (new Set(group.map((course) => course.courseId)).size !== group.length) {
            group.forEach((course) => course.warnings.push('Multiple same-course quotes in this cohort; peer ranking withheld.'));
            continue;
        }
        if (group.length < 2) continue;
        group.sort((a, b) => a.enteredCostUsd! - b.enteredCostUsd! || a.courseId.localeCompare(b.courseId));
        let rank = 1;
        group.forEach((course, index) => {
            if (index && course.enteredCostUsd !== group[index - 1]!.enteredCostUsd) rank = index + 1;
            course.peerCostRank = rank; course.peerCourseCount = group.length;
        });
    }
}
export function buildReport(records: CourseAnalysis[], research: ResearchOptions, synthetic = false): CourseReport {
    const courses = records.flatMap((record) => latestContexts(record).map((item) => assessment(record, item, research)));
    rankPeers(courses);
    return {
        label: synthetic ? 'SYNTHETIC DEMO — invented course facts, not Coursera data' : 'AUTHORIZED IMPORT — caller-supplied observations, not live Coursera retrieval',
        source: synthetic ? 'synthetic-demo' : 'user-authorized-import', isSynthetic: synthetic,
        courseCount: records.length, observationCount: records.reduce((sum, record) => sum + record.observationCount, 0),
        assumptions: research, courses, changes: records.flatMap((record) => findings(record, research)),
        limits: ['No live collection, persistent cross-run history, notifications or future price prediction.',
            'Skill matching is exact normalized tag matching, not learning effectiveness, employability or credential equivalence.',
            'Money scenarios use complete supplied US/USD standard quotes only; no currency conversion, tax estimates or unentered-fee assumptions.',
            'Price ranks are within exact-time, matching-context, caller-declared cohorts of saved courses, not market-wide recommendations.',
            'Different offer contexts remain separate. Missing/capped observations are not course removals.',
            'Subscription periods do not predict completion; catalog subscriptions must not be counted once per included course.'],
    };
}
export function comparisonCsv(report: CourseReport): string {
    return csv(['provenance — ' + report.label, 'courseId', 'title', 'dataProvider', 'observedAt', 'provider', 'courseType', 'difficulty', 'language',
        'skillCoveragePercent', 'matchedSkills', 'missingSkills', 'durationHours', 'durationLabel', 'withinStudyHours',
        'enteredCostUsd', 'billingPeriod', 'priceScope', 'scenarioPeriods', 'withinBudget', 'available', 'certificateIncluded',
        'rating', 'reviewCount', 'peerCostRank', 'peerCourseCount', 'reviewAction', 'warnings', 'courseUrl'],
    report.courses.map((item) => [report.label, item.courseId, item.title, item.dataProvider, item.observedAt, item.provider, item.courseType,
        item.difficulty, item.language, item.skillCoveragePercent, item.matchedSkills, item.missingSkills, item.durationHours,
        item.durationLabel, item.withinStudyHours, item.enteredCostUsd, item.billingPeriod, item.priceScope, item.periods,
        item.withinBudget, item.available, item.certificateIncluded, item.rating, item.reviewCount, item.peerCostRank,
        item.peerCourseCount, item.reviewAction, item.warnings, item.courseUrl]));
}
export function skillGapsCsv(report: CourseReport): string {
    return csv(['provenance — ' + report.label, 'courseId', 'title', 'observedAt', 'requiredSkill', 'suppliedTagMatch'],
        report.courses.flatMap((course) => report.assumptions.requiredSkills.map((skill) => [report.label, course.courseId,
            course.title, course.observedAt, skill, course.observation.skills === null ? 'unknown' : course.matchedSkills.includes(skill) ? 'matched' : 'not_supplied'])));
}
export function changesCsv(report: CourseReport): string {
    return csv(['provenance — ' + report.label, 'courseId', 'title', 'dataProvider', 'type', 'field', 'previous', 'current', 'previousObservedAt', 'observedAt', 'changePercent', 'note'],
        report.changes.map((item) => [report.label, item.courseId, item.title, item.dataProvider, item.type, item.field,
            item.previous, item.current, item.previousObservedAt, item.observedAt, item.changePercent, item.note]));
}
export function qualityCsv(report: CourseReport): string {
    return csv(['provenance — ' + report.label, 'courseId', 'title', 'observedAt', 'warning'], report.courses.flatMap((item) =>
        item.warnings.map((warning) => [report.label, item.courseId, item.title, item.observedAt, warning])));
}
export function reportMarkdown(report: CourseReport): string {
    const lines = ['# Course Catalog Research Report', '', markdown(report.label), '',
        'Saved/preview courses: ' + report.courseCount + '; supplied observations: ' + report.observationCount + '.', '',
        '## Entered research assumptions', '', markdown(JSON.stringify(report.assumptions)), '',
        '## Course review queue', '', '| Course | Supplied skill coverage | Entered US/USD cost | Review |', '| --- | --- | --- | --- |'];
    for (const item of report.courses) lines.push('| ' + markdown(item.title) + ' | ' + (item.skillCoveragePercent === null ? 'unknown / not requested' : item.skillCoveragePercent + '%')
        + ' | ' + (item.enteredCostUsd === null ? 'unknown / not applicable' : '$' + round(item.enteredCostUsd) + ' (' + markdown(item.billingPeriod) + ', ' + item.periods + ' period(s))')
        + ' | ' + markdown(item.reviewAction) + ' |');
    lines.push('', '## Interpretation limits', '', ...report.limits.map((limit) => '- ' + markdown(limit)), '',
        'This is a review aid, not enrollment, accreditation, tax, employment or learning-outcome advice.', '');
    return lines.join('\n');
}
