import { Actor, log } from 'apify';
import { normalizeInput, scrapeCoursera } from './routes.js';
import type { ActorInput } from './types.js';

await Actor.main(async () => {
    const input = (await Actor.getInput<ActorInput>()) ?? {};
    const options = normalizeInput(input);

    log.info('Starting Coursera courses scrape', {
        queries: options.queries,
        maxResults: options.maxResults,
        productTypes: options.productTypes,
        difficulties: options.difficulties,
    });

    const records = await scrapeCoursera(options);

    if (records === 0) {
        throw new Error('No Coursera course records were scraped. Try a broader query or fewer filters.');
    }

    log.info('Coursera scrape finished', { records });
});
