import { Actor } from 'apify';
import { InputError } from './input.js';
import { runWorkflow } from './workflow.js';
import { COURSE_EVENT, saveConfirmedCourse } from './billing.js';

await Actor.main(async () => {
    const raw = (await Actor.getInput()) ?? {};
    try {
        await runWorkflow(raw, {
            canSave: () => Actor.getChargingManager().calculateMaxEventChargeCountWithinLimit(COURSE_EVENT) > 0,
            save: (record) => saveConfirmedCourse(record, { manager: Actor.getChargingManager(), push: (item, event) => Actor.pushData(item, event) }),
            write: async (key, value, contentType) => { await Actor.setValue(key, value, contentType ? { contentType } : undefined); },
            status: async (message) => { await Actor.setStatusMessage(message); },
        });
    } catch (error) {
        if (error instanceof InputError) {
            await Actor.setValue('RUN_STATUS', { outcome: 'invalid_input', code: error.code, message: error.message,
                savedCourseCount: 0, courseResultEventCount: 0, upstreamRequestCount: 0, liveSourceVerified: false });
            await Actor.setStatusMessage(error.message);
        }
        throw error;
    }
});
