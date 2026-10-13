# Coursera Course Analyzer — Skill Gaps & US Budgets

Analyze licensed Coursera course-catalog exports for exact skill-tag gaps, entered
US learning budgets and supplied course changes. Turn authorized JSON or CSV
observations into a clear review queue, four CSV reports and an evidence-linked
JSON/Markdown research report—without a browser, proxy, API key or live lookup.

**This is an import-analysis offering, not a live Coursera scraper.** The former
search route is retired. Select an explicit import or synthetic-demo mode instead
of reusing an old search task. Udemy, learner records, enrollment, assessment
answers and course content are not supported. A source label or rights checkbox
does not grant or verify a licence. This is an independent analysis tool, not an
official Coursera product or an endorsement of a course.

## Start with a clearly labeled synthetic preview

```json
{
  "mode": "demo",
  "demoPreset": "us-skills-comparison",
  "requiredSkills": ["Python", "SQL", "Data analysis"],
  "targetDifficulties": ["beginner"],
  "maximumStudyHours": 20,
  "maxResults": 1
}
```

These examples contain **invented developer-authored facts**, not real courses,
tuition, ratings, recommendations or historical Coursera changes. Open
`COURSE_REPORT`, `REPORT.md` and the CSV artifacts. The demo dataset is empty:
zero course-result events and zero dataset rows. Actor Start and platform usage
still apply; a demo is not guaranteed free or profitable.

Choose from three US synthetic presets:

1. **US Course Skills Comparison — Synthetic Preview:** exact required-tag
   coverage, missing skill evidence and supplied difficulty/hour criteria.
2. **US Learning Budget Review — Synthetic Preview:** one-time versus subscription
   offers, an entered per-learner budget and a disclosed subscription-period scenario.
3. **US Course Catalog Change Review — Synthetic Preview:** matching supplied price,
   skill, study-hour and availability changes, keeping promotional quotes separate.

## Why use this analysis?

For US learning-and-development teams, training consultants and education-market
researchers who already have licensed catalog data:

- Review the tags a catalog actually supplies instead of assuming skill equivalence.
  Missing tags and unknown tag lists are separate outcomes.
- Check an entered budget only against complete standard US/USD offer contexts.
  Currency, country, billing period, access scope, tax basis and additional fees
  stay explicit; missing fees are not silently zero.
- Keep per-learner course tuition separate from catalog-access subscriptions.
  A catalog subscription is **not** charged once per included course in a total.
- Use explicit study hours when supplied. A label such as "1–3 months" is not
  converted into completion hours.
- Inspect the latest supplied pair within each matching context. Price-threshold
  decisions use decimal-safe arithmetic; zero baselines and excessive gaps cannot
  create false percentage alerts.
- Rank entered costs only among distinct saved course IDs at the exact supplied
  time and a matching, caller-declared comparison cohort. Honest ties are preserved;
  ambiguous same-course quotes have no rank.

This combination is the product's proposed value—not proof of global uniqueness,
better results than every competitor, learning effectiveness, accreditation,
employment outcomes, search ranking or customer conversion.

## Import your licensed observations

Select `mode: "import"`, provide exactly one nonempty `importJson` or `importCsv`
text field, identify the export in `importSource`, and confirm `authorizedData: true`
only if the licence covers processing through this paid analysis service. An
ordinary Coursera account, public visibility or another scraper's output does not
by itself establish those rights.

Minimal **invented owner example**, not actual Coursera data:

```json
{
  "mode": "import",
  "authorizedData": true,
  "importSource": "My licensed export — replace this label",
  "maxResults": 1,
  "requiredSkills": ["Python", "SQL"],
  "importJson": "[{\"courseId\":\"OWNER-EXAMPLE-1\",\"title\":\"Invented owner course\",\"observedAt\":\"2026-10-01\",\"skills\":[\"Python\"],\"difficulty\":\"beginner\",\"durationHours\":12}]"
}
```

JSON must be an array supplied **as a string**, not a remote URL. CSV needs a header
and uses `|`-separated skills or a quoted JSON list. Both import text fields are
configured as secret Apify inputs; saved-input encryption passed the owner staging
checks. Authorized normalized observations are intentionally included in the
paid output. Do not submit secrets, learner identities or confidential fields.

### Supported observation columns

| Group | Columns and interpretation |
| --- | --- |
| Required identity/time | `courseId`: 1–160 character string using letters, digits, `~ : _ -`; `title`; `observedAt`: UTC date or timestamp ending in `Z`. Future/impossible dates reject. |
| Catalog context | `provider`, `courseType`, `difficulty` (beginner/intermediate/advanced/mixed), `skills`, `language`, `courseUrl`. |
| Study/review evidence | `durationHours`, `durationLabel`, `rating` (0–5), `reviewCount` (whole number), `available`, `certificateIncluded`. Missing values remain unknown. |
| Price | `priceAmount`, `additionalFeesAmount`, `currency` (3-letter code), `offerCountry` (2-letter code). Numbers only; no currency labels, ranges or shorthand. |
| Offer context | `priceBasis`: standard/promotional/unknown; `accessModel`: one-time/subscription/free/unknown; `billingPeriod`: once/monthly/annual/unknown; `priceScope`: per-learner-course/per-learner-catalog/unknown; `taxBasis`: included/excluded/unknown. |
| Peer cohort | `comparisonGroup`: your declared equivalence group, not a market-wide comparison or verified course equivalence. |

Common aliases such as `id`, `name`, `scrapedAt`, `partnerNames`, `productType`,
`skillNames`, `url` and `price` are accepted. Two columns mapping to the same field
reject as ambiguous. Unknown fields are dropped; their values and names are not
echoed in reports. Text email/phone patterns are redacted. URLs are validated
against HTTPS Coursera catalog paths and stripped of tracking—**never requested**.

Bounds: **2 MiB**, **1,000 supplied observations**, **60 fields per row**, **1–500
saved unique course IDs**, up to **50 skill tags** of 80 characters. All observations
are validated before any result save, including courses beyond your selection cap.
Identical course/time/context observations deduplicate; conflicting ones reject the
whole import. First-seen courses are selected as complete groups.

## Reports and review criteria

| Artifact | Purpose |
| --- | --- |
| `RUN_STATUS` | Honest completed/partial/failed state, confirmed custom-event counters and delivery limits. |
| `COURSE_REPORT` | Saved or synthetic observations, assumptions, course review queue and raw supplied change evidence. |
| `COURSE_COMPARISON.csv` | Skill coverage, difficulty/hour criteria, known cost context, budget result and bounded peer ranks. |
| `SKILL_GAPS.csv` | Each required tag as matched, not supplied, or unknown. |
| `CHANGES.csv` | Latest matching supplied quote and catalog-field changes, with previous/current values and timestamps. |
| `QUALITY.csv` | Missing fields, incomplete context and subscription/credential caveats. |
| `REPORT.md` | Readable research summary and interpretation limits. |
| Dataset | One saved course analysis, including its supplied observations and single-course report; no demo rows. |

CSV formula prefixes are neutralized and Markdown text is escaped. The first CSV
header also carries provenance, so even an empty change report remains clearly
labeled synthetic/import. Reports include only confirmed saved courses; omitted or
unbilled courses are not leaked into a free aggregate report.

Optional inputs:

- `requiredSkills`: up to 50 exact normalized tags; no synonym or semantic matching.
- `targetDifficulties`: supplied-level filter for the review queue, not an
  assessment of learner proficiency.
- `budgetUsd`: entered per-learner budget. No result when the US/USD standard
  offer context or additional fees are missing.
- `maximumStudyHours`: applies only to explicit supplied hours.
- `subscriptionPeriods`: 1–36 assumed monthly/annual periods; default 1. It does
  not predict course completion or certificate entitlement.
- `priceChangeThresholdPercent`: default 5%; applies only to nonzero, complete,
  standard quotes in matching contexts.
- `comparisonWindowDays`: default 90; pairs exceeding the window are reported
  as gaps, not price or catalog-change alerts.

The review actions are deterministic `review_supplied_evidence`,
`outside_entered_criteria` or `incomplete_evidence`, not course recommendations.
Price ranks compare raw entered costs, not rounded displays. The Actor does not
add a total across catalog subscriptions, perform currency conversion, infer
taxes or assume that a missing fee is zero.

## Pricing and spending limits

The course event `course-scraped` is **$0.002 per saved unique imported course
analysis ($2/1,000)**, including its supplied observations. There is no extra
dataset-result event. The automatic `apify-actor-start` fee is **additional**;
check the Actor's Pricing tab for its current amount and any announced future
change. It is charged per allocated GB, minimum one event: at **512 MB**, one
start event is charged. There is no manual second start charge.

For example, a one-course import costs **$0.002 plus the listed start fee**; a
two-course import costs **$0.004 plus the listed start fee**. A synthetic preview
costs the **listed start fee**, with zero course-result events. These examples
exclude any platform-usage charges the current Pricing tab explicitly lists.
Do not describe previews as free runs or assume a future price is already active.

Duplicates, invalid input, omitted courses and synthetic previews create no
course-result events. Start and compute/storage usage can still apply even when
no result is saved. Platform usage follows the Actor's actual monetization policy;
the event price alone is not evidence of net profit or a universal all-in cost.

The SDK's custom-course counter delta confirms result billing rather than its
combined custom-plus-unpriced-dataset acknowledgment. An exact final-row cap is
complete output; a genuine smaller cap remains visibly partial. If a save is
uncertain, the workflow does **not** make an extra save attempt. A persisted/billed
row may still exist after failed acknowledgment; inspect platform billing/dataset
before retrying yourself. SDK-internal transport behavior is outside that
workflow guarantee. Failed report delivery does not initiate more result saves.

**Profitability is not guaranteed.** Seven owner staging fixtures passed output,
secret-input encryption, exact event-count and memory checks at 512 MB. These
checks do not prove customer demand, every maximum-history workload, final
invoices or billing after a price change. Owner QA/build, development, support,
tax and acquisition expenses are separate. Demos have no course-result revenue;
their economics depend on the actual start fee and measured resource costs.

## Source and migration boundaries

Coursera's current [terms](https://www.coursera.org/about/terms) require written
consent for scraping and a separate agreement for commercial use; its
[crawl rules](https://www.coursera.org/robots.txt) disallow the old `/search` route.
This offering makes **zero source/API requests** and does not bypass those rules.
The user is responsible for having a suitable licence for imported data; the Actor
does not validate source rights, accuracy, freshness or current availability.

Old search/URL/proxy tasks receive `LEGACY_INPUT_RETIRED` before any result write.
They are never silently switched to invented previews or a different marketplace.
There is no cross-run observation store, automatic refresh, scheduler,
notification service, learner data collection, certificate issuing or Udemy route.

## Local development

`npm ci --ignore-scripts`, `npm test`, `npm run lint`, `npm run audit:prod`.

Tests use invented fixtures, fake storage/charging ports and a fake API client for
the installed SDK. They do not initialize a paid Actor or contact Coursera.
Deployment should use the exact reviewed source, compiled README and successful
CI commit. Recheck billing and spending-cap behavior after pricing changes.
The owner fixtures are verification evidence, not manufactured popularity,
independent customer reviews or a guarantee of future run economics.
