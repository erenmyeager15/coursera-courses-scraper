# Coursera Courses Scraper - Titles, Ratings, Skills & Partners

Scrape the Coursera course catalog by keyword and export clean course records to JSON, CSV, Excel, or HTML, or pull them via the Apify API. This Coursera scraper extracts course titles, university and company partners, ratings, review counts, skills, difficulty, duration, product type, images, and URLs with no login and no API key required.

Built with Node.js 20, TypeScript, and the Apify SDK using native fetch against Coursera's public search data, with retries and resilient parsing so runs are reliable and repeatable.

> Why Coursera only? This build follows a probe-first workflow. Coursera exposes enough public page data for reliable catalog extraction without a login or paid key. Udemy is intentionally not included: public Udemy course endpoints returned Cloudflare blocks during probing, and Udemy discontinued access to its Affiliate API on January 1, 2025. The actor therefore ships as a reliable Coursera-only scraper instead of shipping a fragile or misleading Udemy integration.

## What It Extracts

- Course, specialization, or program title
- Course URL and Coursera slug
- Product type (course, specialization, professional certificate, and similar)
- University, company, or institution partners
- Difficulty level and duration bucket
- Skill tags exposed in Coursera search data
- Average rating and review/rating count
- Free flag and Coursera Plus flag when present
- Course image URL
- Search query, result page, and scrape timestamp

## Use Cases

1. Build course directories and training catalogs for an education or L&D site.
2. Research competing online courses by keyword, partner, or skill.
3. Track university and company partner offerings over time.
4. Collect B2B education leads for learning and upskilling platforms.
5. Analyze skills demand, difficulty mix, ratings, and review volume across topics.

## Pricing

This Actor uses Apify Pay Per Event pricing. Each clean course record is saved and charged atomically; failed, blocked, or empty results are not billed, and pagination stops when the user's spending limit is reached.

| Event name | Price per event | 1,000 results | 10,000 results |
| --- | ---: | ---: | ---: |
| `course-scraped` | $0.002 | $2.00 | $20.00 |

## Input

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `queries` | array | yes | `["python", "data science"]` | One or more Coursera search keywords. |
| `maxResults` | integer | no | `100` | Maximum unique courses to save across all queries (max 500). |
| `productTypes` | array | no | (none) | Optional filter: `COURSE`, `SPECIALIZATION`, `PROFESSIONAL_CERTIFICATE`, `GUIDED_PROJECT`, `PROJECT`, `DEGREE`, `MASTERTRACK`. |
| `difficulties` | array | no | (none) | Optional filter: `BEGINNER`, `INTERMEDIATE`, `ADVANCED`, `MIXED`. |
| `includeSkills` | boolean | no | `true` | Include Coursera skill tags when present. |
| `proxyConfiguration` | object | no | Proxy off | Optional Apify proxy settings for blocked or large runs. |

## Example Input

```json
{
  "queries": ["python", "data science"],
  "maxResults": 100,
  "productTypes": ["COURSE"],
  "difficulties": ["BEGINNER"],
  "includeSkills": true
}
```

## How to Scrape Coursera Courses (Step by Step)

1. Click **Try for free** / **Run**.
2. Enter one or more course search keywords.
3. Set the maximum number of results (start small to test).
4. Optionally filter by product type or difficulty.
5. Run the actor, then export results as JSON, CSV, Excel, or HTML, or pull them via the Apify API.

## Sample Output

```json
{
  "source": "coursera",
  "query": "python",
  "courseId": "course~ejOz7RDUEei99hK0xs-tsg",
  "title": "Python for Data Science, AI & Development",
  "courseUrl": "https://www.coursera.org/learn/python-for-applied-data-science-ai",
  "courseSlug": "learn/python-for-applied-data-science-ai",
  "productType": "COURSE",
  "productTypeLabel": "Course",
  "partners": ["IBM"],
  "partnerNames": "IBM",
  "difficulty": "BEGINNER",
  "difficultyLabel": "Beginner",
  "duration": "ONE_TO_THREE_MONTHS",
  "durationLabel": "1-3 months",
  "skills": ["Python Programming", "NumPy", "Data Analysis"],
  "skillNames": "Python Programming, NumPy, Data Analysis",
  "rating": 4.620138506696019,
  "ratingRounded": 4.62,
  "reviewCount": 43608,
  "isFree": false,
  "isPartOfCourseraPlus": true,
  "imageUrl": "https://s3.amazonaws.com/coursera-course-photos/c6/fcdecba59c48ad9f64b9cf73964466/BC-5768_VisMerch-Phase-3-Assets_IBM_PythonforDataScience.png",
  "resultPage": 1,
  "scrapedAt": "2026-06-12T19:57:18.970Z"
}
```

## Data Fields

| Field | Description |
| --- | --- |
| `source` | Source platform, currently `coursera`. |
| `query` | Search keyword that found the course. |
| `courseId` | Coursera product identifier. |
| `title` | Course or program title. |
| `courseUrl` | Full Coursera URL. |
| `courseSlug` | Coursera URL slug without the domain. |
| `productType` / `productTypeLabel` | Raw and human-friendly product type. |
| `partners` / `partnerNames` | University, company, or institution partners. |
| `difficulty` / `difficultyLabel` | Raw and human-friendly difficulty level. |
| `duration` / `durationLabel` | Raw and human-friendly duration bucket. |
| `skills` / `skillNames` | Public skill tags when available. |
| `rating` / `ratingRounded` | Average rating, full and rounded. |
| `reviewCount` | Number of ratings or reviews exposed in search data. |
| `isFree` | Coursera free flag when present. |
| `isPartOfCourseraPlus` | Coursera Plus flag when present. |
| `imageUrl` | Course image URL. |
| `resultPage` | Search result page where the item was found. |
| `scrapedAt` | ISO timestamp for the scrape. |

## How It Works

1. Validates input and normalizes queries and filters.
2. Fetches Coursera search pages and reads the embedded public catalog payload.
3. Extracts and cleans fields, mapping raw enums to readable labels.
4. Deduplicates by Coursera product ID.
5. Atomically saves each clean record and charges `course-scraped`, stopping pagination at the spending limit.

## Known Limits

- Pagination is supported up to 500 unique records per run.
- Results are deduplicated by Coursera product ID.
- Skill tags, ratings, and Plus/free flags are conditional on what Coursera exposes in search data.
- Coursera may change its public page payloads, which can require parser updates.
- Udemy is parked until an official, accessible, and compliant data source becomes available.

## Legal and Ethical Use

Use this Actor for legitimate research, catalog building, and analysis. You are responsible for complying with Coursera's terms, privacy laws, and local regulations wherever you use the data.

## Responsible Use

This Actor is intended for lawful collection of publicly available information only. Users are responsible for ensuring their use complies with the source website's terms, robots.txt, applicable privacy laws, including India's DPDP Act, and all local regulations.

Do not use this Actor to collect, store, sell, or misuse personal data without a lawful basis. The Actor author is not responsible for misuse by end users.

## License

Apache-2.0. See `LICENSE`.
