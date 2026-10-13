import { InputError, inputObject } from './input.js';
import type { DemoPreset } from './types.js';

const base = {
    courseId: 'DEMO-python', title: 'Invented Python Fundamentals', provider: 'Invented Learning Studio',
    observedAt: '2026-10-01', courseType: 'COURSE', difficulty: 'beginner', skills: ['Python', 'Data analysis'],
    language: 'English', durationHours: 12, durationLabel: 'Invented 12-hour estimate', rating: 4.5, reviewCount: 100,
    available: true, certificateIncluded: true, priceAmount: 50, additionalFeesAmount: 0, currency: 'USD', offerCountry: 'US',
    priceBasis: 'standard', accessModel: 'one-time', billingPeriod: 'once', priceScope: 'per-learner-course',
    taxBasis: 'included', comparisonGroup: 'Invented beginner comparison',
};
export function assertDemoInput(raw: unknown): void {
    const object = inputObject(raw);
    if (['importJson', 'importCsv', 'importSource'].some((key) => object[key] !== undefined && object[key] !== null && object[key] !== '')
        || (object.authorizedData !== undefined && object.authorizedData !== false)) {
        throw new InputError('Demo cannot contain import data or a rights declaration. Remove import fields or select import; synthetic previews never replace your export.');
    }
}
export function demoRows(preset: DemoPreset): Record<string, unknown>[] {
    if (preset === 'us-learning-budget') return [base,
        { ...base, courseId: 'DEMO-cloud', title: 'Invented Cloud Basics', priceAmount: 19, accessModel: 'subscription',
            billingPeriod: 'monthly', priceScope: 'per-learner-catalog', skills: ['Cloud computing'], durationHours: 16 },
        { ...base, courseId: 'DEMO-sql', title: 'Invented SQL Course', priceAmount: 80, skills: ['SQL'], durationHours: 30 }];
    if (preset === 'us-catalog-change-review') return [base,
        { ...base, observedAt: '2026-10-10', priceAmount: 55, skills: ['Python', 'Data analysis', 'SQL'], durationHours: 15, available: false },
        { ...base, courseId: 'DEMO-promo', title: 'Invented Conditional Quote', priceBasis: 'promotional', priceAmount: 10 }];
    return [base,
        { ...base, courseId: 'DEMO-sql', title: 'Invented SQL Essentials', priceAmount: 40, skills: ['SQL', 'Data analysis'], durationHours: 8 },
        { ...base, courseId: 'DEMO-unknown', title: 'Invented Incomplete Catalog Entry', skills: null, durationHours: null,
            priceAmount: null, additionalFeesAmount: null, available: null, certificateIncluded: null }];
}
