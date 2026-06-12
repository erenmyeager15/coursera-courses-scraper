# Coursera Courses Scraper - Course Catalog Data

Scrape Coursera search results into clean course catalog records for market research, education lead generation, training catalog analysis, and competitive course tracking. The actor searches Coursera by one or more keywords and saves structured records with course title, URL, product type, university or company partners, difficulty, duration, skills, rating, review count, image URL, and Coursera Plus/free flags when present.

This build follows a probe-first workflow. Coursera exposes enough public page data for reliable catalog extraction without a login or paid key. Udemy is intentionally not included in this actor: public Udemy course endpoints returned Cloudflare blocks during probing, and Udemy states that access to its Affiliate API was discontinued from January 1, 2025. The actor therefore ships as a Coursera-only scraper instead of publishing fragile or misleading Udemy support.

## Use Cases

- Build course directories and training catalogs.
- Research competing online courses by keyword.
- Track university and company partner offerings.
- Collect B2B education leads for learning platforms.
- Analyze skills, difficulty levels, ratings, and review volume.

## Input

```json
{
  "queries": ["python", "data science"],
  "maxResults": 100,
  "productTypes": ["COURSE"],
  "difficulties": ["BEGINNER"],
  "includeSkills": true
}
```

## Output

```json
{
  "source": "coursera",
  "query": "python",
  "courseId": "course~ejOz7RDUEei99hK0xs-tsg",
  "title": "Python for Data Science, AI & Development",
  "courseUrl": "https://www.coursera.org/learn/python-for-applied-data-science-ai",
  "courseSlug": "learn/python-for-applied-data-science-ai",
  "productType": "COURSE",
  "partners": ["IBM"],
  "partnerNames": "IBM",
  "difficulty": "BEGINNER",
  "duration": "ONE_TO_THREE_MONTHS",
  "skills": ["Python Programming", "NumPy", "Data Analysis"],
  "skillNames": "Python Programming, NumPy, Data Analysis",
  "rating": 4.620138506696019,
  "reviewCount": 43608,
  "isFree": false,
  "isPartOfCourseraPlus": true,
  "imageUrl": "https://s3.amazonaws.com/coursera-course-photos/c6/fcdecba59c48ad9f64b9cf73964466/BC-5768_VisMerch-Phase-3-Assets_IBM_PythonforDataScience.png",
  "resultPage": 1,
  "scrapedAt": "2026-06-12T00:00:00.000Z"
}
```

## How to Scrape Coursera Courses

1. Enter one or more course search keywords.
2. Set the maximum number of results to collect.
3. Optionally filter by product type or difficulty.
4. Run the actor.
5. Download the dataset as JSON, CSV, Excel, or via API.

## Pricing

| Event | When charged | Price |
| --- | --- | --- |
| `course-scraped` | Each unique Coursera course record saved | `$0.002` |

Charges are made only after a real record is saved to the Apify Dataset.

## Data Fields

| Field | Description |
| --- | --- |
| `source` | Source platform, currently `coursera`. |
| `query` | Search keyword that found the course. |
| `courseId` | Coursera product identifier. |
| `title` | Course or program title. |
| `courseUrl` | Full Coursera URL. |
| `productType` | Course, specialization, professional certificate, and similar product type. |
| `partners` | University, company, or institution partners. |
| `difficulty` | Coursera difficulty label when available. |
| `duration` | Coursera duration bucket when available. |
| `skills` | Public skill tags when available. |
| `rating` | Average rating. |
| `reviewCount` | Number of ratings or reviews exposed in search data. |
| `isFree` | Coursera free flag when present. |
| `isPartOfCourseraPlus` | Coursera Plus flag when present. |
| `imageUrl` | Course image URL. |
| `scrapedAt` | ISO timestamp for the scrape. |

## Notes and Limits

- Pagination is supported up to 500 unique records per run.
- Results are deduplicated by Coursera product ID.
- Coursera may change its public page payloads, which can require parser updates.
- Udemy is parked until an official, accessible, and compliant data source becomes available.
