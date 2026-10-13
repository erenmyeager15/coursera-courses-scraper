import type { ChargeResultLike } from './types.js';

export const COURSE_EVENT = 'course-scraped';
export interface CourseChargingManager {
    getPricingInfo(): { isPayPerEvent: boolean; perEventPrices: Record<string, number> };
    getChargedEventCount(eventName: string): number;
    calculateMaxEventChargeCountWithinLimit(eventName: string): number;
}
export interface CourseSavePorts<T> {
    manager: CourseChargingManager;
    push(record: T, eventName: string): Promise<ChargeResultLike>;
}

export class BillingAcknowledgmentError extends Error { readonly code = 'BILLING_ACKNOWLEDGMENT_FAILED'; }

/** Actor.pushData chargedCount can aggregate custom AND synthetic acknowledgments.
 * Normalize to the confirmed custom course counter delta, never to total events.
 * No extra charge call, retry, dataset write or remote lookup is performed here.
 */
export async function saveConfirmedCourse<T>(record: T, ports: CourseSavePorts<T>): Promise<ChargeResultLike> {
    const { manager } = ports;
    const pricing = manager.getPricingInfo();
    const eventPrice = pricing.perEventPrices[COURSE_EVENT];
    if (pricing.isPayPerEvent && (typeof eventPrice !== 'number' || !Number.isFinite(eventPrice) || eventPrice <= 0)) {
        throw new BillingAcknowledgmentError('Course-result pricing is unavailable; no course write was attempted.');
    }
    if ((pricing.perEventPrices['apify-default-dataset-item'] ?? 0) > 0) {
        throw new BillingAcknowledgmentError('Unexpected additional dataset-result pricing; no course write was attempted.');
    }
    const before = manager.getChargedEventCount(COURSE_EVENT);
    if (!Number.isSafeInteger(before) || before < 0) throw new BillingAcknowledgmentError('Course counter is unavailable; no course write was attempted.');
    const acknowledgment = await ports.push(record, COURSE_EVENT);
    if (!acknowledgment || !Number.isSafeInteger(acknowledgment.chargedCount) || acknowledgment.chargedCount < 0
        || typeof acknowledgment.eventChargeLimitReached !== 'boolean') {
        throw new BillingAcknowledgmentError('Course write acknowledgment is unavailable; no retry was attempted.');
    }
    const after = manager.getChargedEventCount(COURSE_EVENT);
    const customCount = after - before;
    if (!Number.isSafeInteger(after) || after < 0 || ![0, 1].includes(customCount) || acknowledgment.chargedCount < customCount) {
        throw new BillingAcknowledgmentError('Course event acknowledgment is inconsistent; no retry was attempted.');
    }
    const courseLimitReached = manager.calculateMaxEventChargeCountWithinLimit(COURSE_EVENT) <= 0;
    if (pricing.isPayPerEvent && customCount === 0 && !courseLimitReached) {
        throw new BillingAcknowledgmentError('Course write lacks a confirmed custom event; no retry was attempted.');
    }
    return { chargedCount: customCount, eventChargeLimitReached: pricing.isPayPerEvent ? courseLimitReached : acknowledgment.eventChargeLimitReached };
}
