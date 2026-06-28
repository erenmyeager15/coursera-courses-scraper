import { Actor, log } from 'apify';
import { normalizeInput, scrapeCoursera } from './routes.js';
import type { ActorInput, ProxyUrlProvider } from './types.js';

await Actor.main(async () => {
    const input = (await Actor.getInput<ActorInput>()) ?? {};
    const options = normalizeInput(input);
    const proxyInput = input.proxyConfiguration;
    const proxyConfiguration = (proxyInput?.useApifyProxy || proxyInput?.proxyUrls?.length)
        ? await Actor.createProxyConfiguration(proxyInput)
        : undefined;

    log.info('Starting Coursera courses scrape', {
        queries: options.queries,
        maxResults: options.maxResults,
        productTypes: options.productTypes,
        difficulties: options.difficulties,
    });

    const result = await scrapeCoursera(options, proxyConfiguration as ProxyUrlProvider | undefined);

    if (result.records === 0 && !result.spendingLimitReached) {
        throw new Error('No Coursera course records were scraped. Try a broader query or fewer filters.');
    }

    if (!result.spendingLimitReached) {
        await Actor.setStatusMessage(`Finished with ${result.records} unique course(s).`);
        log.info('Coursera scrape finished', { records: result.records });
    }
});
