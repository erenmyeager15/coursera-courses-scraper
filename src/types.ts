export type SourceName = 'coursera';

export type ProductType =
    | 'COURSE'
    | 'SPECIALIZATION'
    | 'PROFESSIONAL_CERTIFICATE'
    | 'GUIDED_PROJECT'
    | 'PROJECT'
    | 'DEGREE'
    | 'MASTERTRACK'
    | 'CERTIFICATE'
    | string;

export interface ActorInput {
    queries?: string[];
    keyword?: string;
    maxResults?: number;
    productTypes?: ProductType[];
    difficulties?: string[];
    includeSkills?: boolean;
    proxyConfiguration?: {
        useApifyProxy?: boolean;
        apifyProxyGroups?: string[];
        apifyProxyCountry?: string;
    };
}

export interface CourseraProductHit {
    id: string | undefined;
    name: string | undefined;
    url: string | undefined;
    partners: string[] | undefined;
    productType: string | undefined;
    difficulty: string | undefined;
    duration: string | undefined;
    skills: string[] | undefined;
    rating: number | undefined;
    ratings: number | undefined;
    imageUrl: string | undefined;
    free: boolean | undefined;
    plus: boolean | undefined;
}

export interface CourseRecord {
    source: SourceName;
    query: string;
    courseId: string | null;
    title: string | null;
    courseUrl: string | null;
    courseSlug: string | null;
    productType: string | null;
    productTypeLabel: string | null;
    partners: string[];
    partnerNames: string | null;
    difficulty: string | null;
    difficultyLabel: string | null;
    duration: string | null;
    durationLabel: string | null;
    skills: string[];
    skillNames: string | null;
    rating: number | null;
    ratingRounded: number | null;
    reviewCount: number | null;
    isFree: boolean | null;
    isPartOfCourseraPlus: boolean | null;
    imageUrl: string | null;
    resultPage: number;
    scrapedAt: string;
}

export interface SearchOptions {
    queries: string[];
    maxResults: number;
    productTypes: string[];
    difficulties: string[];
    includeSkills: boolean;
}
