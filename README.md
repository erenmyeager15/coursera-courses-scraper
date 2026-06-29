# Coursera Courses Scraper - Course Catalog Data

Scrape Coursera public course catalog search results and export clean course records with titles, partners, URLs, product type, difficulty, duration, ratings, review counts, skills, image URLs, and scrape timestamps.

This Actor is Coursera-only. The local folder name still mentions Udemy from an earlier plan, but Udemy is intentionally not included because public Udemy endpoints were blocked during probing and Udemy discontinued access to its Affiliate API on January 1, 2025. Shipping a reliable Coursera scraper is safer than advertising a fragile Udemy integration.

## Quick Start

```json
{
  "queries": ["python"],
  "maxResults": 5,
  "productTypes": ["COURSE"],
  "difficulties": [],
  "includeSkills": true,
  "proxyConfiguration": {
    "useApifyProxy": false
  }
}
```

This small run searches Coursera for Python courses, limits results to 5, and keeps proxy usage off.

## Input

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `queries` | string array | `["python"]` | Coursera search keywords. |
| `maxResults` | integer | `10` | Maximum unique course records across all queries. |
| `productTypes` | string array | `[]` | Optional filter such as `COURSE`, `SPECIALIZATION`, or `PROFESSIONAL_CERTIFICATE`. |
| `difficulties` | string array | `[]` | Optional filter such as `BEGINNER`, `INTERMEDIATE`, `ADVANCED`, or `MIXED`. |
| `includeSkills` | boolean | `true` | Include Coursera skill tags when present. |
| `proxyConfiguration` | object | disabled | Usually not needed for small runs. Enable only if larger runs hit access issues. |

## Output

Each dataset row is one Coursera catalog item:

| Field | Description |
| --- | --- |
| `source`, `query` | Source platform and search keyword. |
| `courseId`, `title`, `courseUrl`, `courseSlug` | Coursera identity and URL fields. |
| `productType`, `productTypeLabel` | Course, specialization, certificate, or similar product type. |
| `partners`, `partnerNames` | Partner institutions or companies. |
| `difficulty`, `difficultyLabel` | Difficulty level when exposed. |
| `duration`, `durationLabel` | Duration bucket when exposed. |
| `skills`, `skillNames` | Public skill tags when exposed and enabled. |
| `rating`, `ratingRounded`, `reviewCount` | Rating metadata from Coursera search data. |
| `isFree`, `isPartOfCourseraPlus` | Availability flags when exposed. |
| `imageUrl`, `resultPage`, `scrapedAt` | Image, result page, and scrape timestamp. |

## Verified Sample

An existing successful run for `python` returned this row:

```json
{
  "source": "coursera",
  "query": "python",
  "courseId": "course~ejOz7RDUEei99hK0xs-tsg",
  "title": "Python for Data Science, AI & Development",
  "courseUrl": "https://www.coursera.org/learn/python-for-applied-data-science-ai",
  "productType": "COURSE",
  "productTypeLabel": "Course",
  "partners": ["IBM"],
  "partnerNames": "IBM",
  "difficulty": "BEGINNER",
  "durationLabel": "1-3 months",
  "ratingRounded": 4.62,
  "reviewCount": 43627,
  "isPartOfCourseraPlus": true
}
```

## Pricing

Active pay-per-event pricing:

| Event | Price |
| --- | ---: |
| `course-scraped` | `$0.002` per course |
| `apify-actor-start` | `$0.00005` per GB at run start |

Each unique course is saved and charged atomically. Duplicate course IDs are skipped, failed or empty results are not charged, and pagination stops when the user's spending limit is reached.

## Common Workflows

1. Build a public catalog of courses for a topic such as Python, AI, marketing, or project management.
2. Compare partner institutions, ratings, difficulty, and duration across a keyword.
3. Track education-market changes over time with scheduled runs.
4. Export course rows to CSV, Excel, JSON, HTML, or the Apify API.

## Notes and Limits

- Coursera search data changes over time; fields depend on what Coursera exposes publicly.
- Skill tags, ratings, free flags, and Coursera Plus flags are conditional and may be null.
- Udemy is not part of this Actor until there is a stable, compliant public or official data source.
- This Actor collects public course catalog metadata, not learner data.

## Responsible Use

Use this Actor for lawful course catalog research and analysis. Respect Coursera terms, copyright, privacy laws, and any restrictions that apply to exported or republished data.

## License

Apache-2.0
