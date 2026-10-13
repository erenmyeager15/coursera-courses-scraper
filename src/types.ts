export type Mode = 'demo' | 'import';
export type DemoPreset = 'us-skills-comparison' | 'us-learning-budget' | 'us-catalog-change-review';
export type PriceBasis = 'standard' | 'promotional' | 'unknown';
export type AccessModel = 'one-time' | 'subscription' | 'free' | 'unknown';
export type BillingPeriod = 'once' | 'monthly' | 'annual' | 'unknown';
export type PriceScope = 'per-learner-course' | 'per-learner-catalog' | 'unknown';
export interface ResearchOptions {
    requiredSkills: string[]; targetDifficulties: string[];
    budgetUsd: number | null; maximumStudyHours: number | null;
    subscriptionPeriods: number; priceChangeThresholdPercent: number; comparisonWindowDays: number;
}
export interface NormalizedInput {
    mode: Mode; demoPreset: DemoPreset; maxResults: number; research: ResearchOptions;
}
export interface CourseObservation {
    courseId: string; title: string; observedAt: string; courseUrl: string | null;
    provider: string | null; courseType: string | null; difficulty: string | null;
    skills: string[] | null; language: string | null; durationHours: number | null; durationLabel: string | null;
    rating: number | null; reviewCount: number | null; available: boolean | null; certificateIncluded: boolean | null;
    priceAmount: number | null; additionalFeesAmount: number | null; currency: string | null; offerCountry: string | null;
    priceBasis: PriceBasis; accessModel: AccessModel; billingPeriod: BillingPeriod; priceScope: PriceScope;
    taxBasis: 'included' | 'excluded' | 'unknown'; comparisonGroup: string | null;
}
export interface CourseAnalysis {
    recordType: 'authorized-course-analysis' | 'synthetic-course-preview';
    source: 'user-authorized-import' | 'synthetic-demo'; platform: 'coursera'; isSynthetic: boolean;
    courseId: string; title: string; dataProvider: string; importedAt: string;
    observationCount: number; observations: CourseObservation[];
}
export interface ImportPlan {
    records: CourseAnalysis[]; inputRowCount: number; normalizedObservationCount: number;
    duplicateObservationsRemoved: number; inputCourseCount: number; selectedCourseCount: number;
    omittedCourseCount: number; unsupportedColumnsDropped: number; dataProvider: string;
}
export interface ChargeResultLike { chargedCount: number; eventChargeLimitReached: boolean; }
