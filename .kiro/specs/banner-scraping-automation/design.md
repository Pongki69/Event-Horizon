# Design Document: Banner Scraping Automation

## Overview

This design document describes the implementation of automated banner scraping for three games: Genshin Impact, Honkai: Star Rail, and Zenless Zone Zero. The system follows the established pattern used by existing event scrapers, using Puppeteer to scrape wiki pages, download images, and generate JavaScript data files.

The banner scrapers will run hourly via GitHub Actions and update three separate data files:
- `src/data/scrapedBanners.js` (Genshin Impact)
- `src/data/scrapedStarRailBanners.js` (Honkai: Star Rail)
- `src/data/scrapedZZZBanners.js` (Zenless Zone Zero)

## Architecture

The system consists of three independent scraper scripts that follow the same architectural pattern:

```
┌─────────────────────────────────────────────────────────────┐
│                    GitHub Actions Workflow                   │
│  (runs hourly, executes all three scrapers in parallel)     │
└─────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┼─────────────┐
                │             │             │
                ▼             ▼             ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │   Genshin    │  │  Star Rail   │  │     ZZZ      │
    │   Scraper    │  │   Scraper    │  │   Scraper    │
    └──────────────┘  └──────────────┘  └──────────────┘
            │                 │                 │
            ▼                 ▼                 ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │ Fandom Wiki  │  │ Fandom Wiki  │  │ Fandom Wiki  │
    │  (Wishes)    │  │   (Warp)     │  │(Signal Search)│
    └──────────────┘  └──────────────┘  └──────────────┘
            │                 │                 │
            ▼                 ▼                 ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │ Download     │  │ Download     │  │ Download     │
    │ Images       │  │ Images       │  │ Images       │
    └──────────────┘  └──────────────┘  └──────────────┘
            │                 │                 │
            ▼                 ▼                 ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │ scrapedBanners│ │scrapedStarRail│ │scrapedZZZ    │
    │    .js       │  │  Banners.js  │  │ Banners.js   │
    └──────────────┘  └──────────────┘  └──────────────┘
```

Each scraper operates independently and follows this flow:
1. Launch headless Chromium browser
2. Navigate to wiki page
3. Parse banner table (current and upcoming sections)
4. Extract banner data (title, dates, type, image URL)
5. Convert Asia time (UTC+8) to UTC
6. Download banner images to local storage
7. Generate JavaScript data file
8. Close browser

## Components and Interfaces

### 1. Scraper Scripts

Three main scraper scripts that share the same structure:

**scrapeGenshinBanners.js**
```javascript
// Main scraping function
async function scrapeGenshinBanners()

// Helper functions
function parseWikiDate(dateStr)
function monthToIndex(monthName)
async function downloadBannerImage(imageUrl, bannerTitle)
function generateBannersCode(banners)
```

**scrapeStarRailBanners.js**
```javascript
// Main scraping function
async function scrapeStarRailBanners()

// Helper functions
function parseWikiDate(dateStr)
function monthToIndex(monthName)
async function downloadBannerImage(imageUrl, bannerTitle)
function generateBannersCode(banners)
```

**scrapeZZZBanners.js**
```javascript
// Main scraping function
async function scrapeZZZBanners()

// Helper functions
function parseWikiDate(dateStr)
function monthToIndex(monthName)
async function downloadBannerImage(imageUrl, bannerTitle)
function generateBannersCode(banners)
```

### 2. Shared Utilities (archiveUtils.js)

The existing `archiveUtils.js` module provides the `downloadImage` function:

```javascript
/**
 * Download and save an image locally
 * @param {string} imageUrl - URL of the image to download
 * @param {string} game - Game name (e.g., 'genshin-impact')
 * @param {string} eventTitle - Title for filename generation
 * @param {string} type - Subdirectory type ('events' or 'banners')
 * @returns {Promise<string|null>} Local image path or null
 */
export async function downloadImage(imageUrl, game, eventTitle, type = 'events')
```

### 3. Puppeteer Browser Interface

Each scraper uses Puppeteer to control a headless browser:

```javascript
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 ...');
```

### 4. Wiki Page Parsing

Each scraper extracts banner data from wiki tables using page.evaluate():

```javascript
const banners = await page.evaluate(() => {
  // Find "Current" and "Upcoming" sections
  // Extract table rows
  // Parse banner data from cells
  // Return array of banner objects
});
```

### 5. Data File Generation

Each scraper generates a JavaScript ES6 module:

```javascript
// scrapedBanners.js format
export const scrapedBanners = [
  {
    title: 'Banner Name',
    start: new Date('2026-02-03T06:59:00.000Z'),
    end: new Date('2026-02-24T06:59:00.000Z'),
    image: '/images/genshin-impact/banners/banner-name.png',
    type: 'test-run',
    game: 'Genshin Impact',
    description: 'Banner description text',
  }
];
```

## Data Models

### Banner Object

```javascript
{
  title: string,        // Banner name (e.g., "Zibai", "Neuvillette")
  start: Date,          // Banner start time (UTC)
  end: Date,            // Banner end time (UTC)
  image: string,        // Local image path (e.g., "/images/genshin-impact/banners/zibai.png")
  type: string,         // Banner type: 'test-run' or 'upcoming'
  game: string,         // Game name: 'Genshin Impact', 'Star Rail', or 'Zenless Zone Zero'
  description: string   // Banner description text
}
```

### Wiki Banner Data (Intermediate)

```javascript
{
  name: string,         // Banner name from wiki
  duration: string,     // Raw duration string (e.g., "February 09, 2026 – February 24, 2026")
  type: string,         // Banner type from wiki
  url: string,          // Wiki page URL for the banner
  imageUrl: string,     // Image URL from wiki
  section: string       // 'Current' or 'Upcoming'
}
```

### Date Parsing

Wiki dates are in format: "Month Day, Year" (e.g., "February 09, 2026")
- Banners typically start at 12:00 noon Asia time (UTC+8) = 04:00 UTC
- Banners typically end at 11:59 Asia time (UTC+8) = 03:59 UTC

Conversion logic:
```
Asia Time (UTC+8) → UTC
12:00 Asia = 04:00 UTC (same day)
11:59 Asia = 03:59 UTC (same day)
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Date Conversion Consistency

*For any* valid Asia server time (UTC+8) date string, parsing and converting to UTC should produce a timestamp that is exactly 8 hours earlier than the Asia time.

**Validates: Requirements 6.2, 6.3, 6.4**

### Property 2: Image Download Idempotence

*For any* banner image URL and banner title, downloading the image multiple times should result in the same local file path and should not create duplicate files.

**Validates: Requirements 5.3, 11.2**

### Property 3: Banner Deduplication

*For any* set of banners with the same title and start date, the deduplication process should keep exactly one banner entry.

**Validates: Requirements 7.1, 7.2, 11.4**

### Property 4: Output File Validity

*For any* generated JavaScript data file, the file should be valid ES6 module syntax that can be imported without syntax errors.

**Validates: Requirements 8.1, 8.3, 8.4**

### Property 5: Error Handling Continuity

*For any* banner in a list where one banner's image download fails, the scraper should continue processing all remaining banners.

**Validates: Requirements 1.7, 2.7, 3.7, 10.1, 10.3**

### Property 6: Filename Safety

*For any* banner title containing special characters, the generated filename should contain only alphanumeric characters, hyphens, and underscores.

**Validates: Requirements 5.5**

### Property 7: Timezone Boundary Handling

*For any* Asia time that converts to a different UTC date (e.g., 02:00 Asia = 18:00 UTC previous day), the date conversion should correctly adjust the day component.

**Validates: Requirements 6.3**

### Property 8: Banner Type Classification

*For any* banner scraped from the wiki, it should be classified as either 'test-run' or 'upcoming' based on the section it appears in.

**Validates: Requirements 1.3, 2.3, 3.3**

### Property 9: Required Fields Presence

*For any* banner object in the generated output file, it should contain all required fields: title, start, end, image, type, game, and description.

**Validates: Requirements 8.2**

### Property 10: Character Escaping

*For any* banner description or title containing special characters (quotes, backticks, dollar signs), the generated JavaScript code should properly escape them to prevent syntax errors.

**Validates: Requirements 8.4, 8.5**

## Error Handling

### Network Errors

**Strategy**: Graceful degradation with logging
- If wiki page fails to load: Log error, exit with status code 1
- If image download fails: Log error, use empty string for image path, continue
- If API request fails: Log error, fall back to direct page scraping

**Implementation**:
```javascript
try {
  await page.goto(wikiUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
} catch (error) {
  console.error('Failed to load wiki page:', error.message);
  process.exit(1);
}
```

### Parsing Errors

**Strategy**: Skip invalid data, continue processing
- If date parsing fails: Log error, skip that banner
- If required field is missing: Log error, skip that banner
- If table structure is unexpected: Log error, return empty array

**Implementation**:
```javascript
if (!startDate || !endDate) {
  console.log(`Skipping banner ${banner.name}: invalid dates`);
  continue;
}
```

### File System Errors

**Strategy**: Fail fast with clear error message
- If directory creation fails: Log error, exit with status code 1
- If file write fails: Log error, exit with status code 1
- If image save fails: Log error, use empty string for image path

**Implementation**:
```javascript
try {
  fs.writeFileSync(outputPath, jsCode);
} catch (error) {
  console.error('Failed to write output file:', error.message);
  process.exit(1);
}
```

### Browser Errors

**Strategy**: Ensure cleanup, fail fast
- Always close browser in finally block
- If browser launch fails: Log error, exit with status code 1
- If page navigation times out: Log error, exit with status code 1

**Implementation**:
```javascript
try {
  // Scraping logic
} catch (error) {
  console.error('Scraping failed:', error);
  await browser.close();
  process.exit(1);
} finally {
  await browser.close();
}
```

## Testing Strategy

### Unit Testing

Unit tests should focus on:
1. **Date parsing functions**: Test various date formats and edge cases
2. **Filename generation**: Test special character handling
3. **Banner deduplication**: Test with duplicate and unique banners
4. **Character escaping**: Test strings with quotes, backticks, dollar signs

Example unit tests:
```javascript
describe('parseWikiDate', () => {
  test('parses standard date format', () => {
    const result = parseWikiDate('February 09, 2026');
    expect(result).toBe(Date.UTC(2026, 1, 9, 3, 59, 0) - (8 * 60 * 60 * 1000));
  });
  
  test('handles abbreviated month names', () => {
    const result = parseWikiDate('Feb. 09, 2026');
    expect(result).toBe(Date.UTC(2026, 1, 9, 3, 59, 0) - (8 * 60 * 60 * 1000));
  });
});

describe('generateSafeFilename', () => {
  test('removes special characters', () => {
    const result = generateSafeFilename('Banner: Name (Test)');
    expect(result).toMatch(/^[a-z0-9-]+$/);
  });
});
```

### Property-Based Testing

Property tests should verify universal correctness properties:

**Property Test 1: Date Conversion Consistency**
```javascript
// Feature: banner-scraping-automation, Property 1: Date conversion consistency
test('date conversion is consistent', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 2026, max: 2030 }), // year
      fc.integer({ min: 0, max: 11 }),      // month
      fc.integer({ min: 1, max: 28 }),      // day
      (year, month, day) => {
        const dateStr = formatAsiaDate(year, month, day);
        const utcTimestamp = parseWikiDate(dateStr);
        const asiaTimestamp = Date.UTC(year, month, day, 3, 59, 0);
        const expectedUtc = asiaTimestamp - (8 * 60 * 60 * 1000);
        return utcTimestamp === expectedUtc;
      }
    ),
    { numRuns: 100 }
  );
});
```

**Property Test 2: Image Download Idempotence**
```javascript
// Feature: banner-scraping-automation, Property 2: Image download idempotence
test('downloading same image twice produces same path', async () => {
  fc.assert(
    fc.asyncProperty(
      fc.webUrl(),
      fc.string({ minLength: 1, maxLength: 50 }),
      async (imageUrl, bannerTitle) => {
        const path1 = await downloadImage(imageUrl, 'genshin-impact', bannerTitle, 'banners');
        const path2 = await downloadImage(imageUrl, 'genshin-impact', bannerTitle, 'banners');
        return path1 === path2;
      }
    ),
    { numRuns: 100 }
  );
});
```

**Property Test 3: Banner Deduplication**
```javascript
// Feature: banner-scraping-automation, Property 3: Banner deduplication
test('deduplication removes exact duplicates', () => {
  fc.assert(
    fc.property(
      fc.array(fc.record({
        title: fc.string(),
        start: fc.date(),
        end: fc.date(),
        image: fc.string(),
        type: fc.constantFrom('test-run', 'upcoming'),
        game: fc.string(),
        description: fc.string()
      })),
      (banners) => {
        const duplicated = [...banners, ...banners];
        const deduplicated = deduplicateBanners(duplicated);
        return deduplicated.length === banners.length;
      }
    ),
    { numRuns: 100 }
  );
});
```

**Property Test 4: Output File Validity**
```javascript
// Feature: banner-scraping-automation, Property 4: Output file validity
test('generated code is valid JavaScript', () => {
  fc.assert(
    fc.property(
      fc.array(fc.record({
        title: fc.string(),
        start: fc.date().map(d => d.toISOString()),
        end: fc.date().map(d => d.toISOString()),
        image: fc.string(),
        type: fc.constantFrom('test-run', 'upcoming'),
        game: fc.string(),
        description: fc.string()
      })),
      (banners) => {
        const code = generateBannersCode(banners);
        try {
          new Function(code); // Try to parse as JavaScript
          return true;
        } catch (e) {
          return false;
        }
      }
    ),
    { numRuns: 100 }
  );
});
```

**Property Test 5: Error Handling Continuity**
```javascript
// Feature: banner-scraping-automation, Property 5: Error handling continuity
test('one failed image download does not stop processing', async () => {
  fc.assert(
    fc.asyncProperty(
      fc.array(fc.record({
        name: fc.string(),
        imageUrl: fc.oneof(fc.webUrl(), fc.constant('INVALID_URL')),
        // ... other fields
      }), { minLength: 3 }),
      async (banners) => {
        const results = await processBanners(banners);
        // Should have results for all banners, even if some images failed
        return results.length === banners.length;
      }
    ),
    { numRuns: 100 }
  );
});
```

**Property Test 6: Filename Safety**
```javascript
// Feature: banner-scraping-automation, Property 6: Filename safety
test('generated filenames are filesystem-safe', () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 1, maxLength: 100 }),
      (bannerTitle) => {
        const filename = generateSafeFilename(bannerTitle);
        return /^[a-z0-9-]+$/.test(filename);
      }
    ),
    { numRuns: 100 }
  );
});
```

**Property Test 7: Timezone Boundary Handling**
```javascript
// Feature: banner-scraping-automation, Property 7: Timezone boundary handling
test('early morning Asia times convert to previous UTC day', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 2026, max: 2030 }),
      fc.integer({ min: 0, max: 11 }),
      fc.integer({ min: 2, max: 28 }), // Avoid day 1 to ensure previous day exists
      (year, month, day) => {
        // Test with 03:59 Asia time (should be previous day in UTC)
        const asiaTimestamp = Date.UTC(year, month, day, 3, 59, 0);
        const utcTimestamp = asiaTimestamp - (8 * 60 * 60 * 1000);
        const utcDate = new Date(utcTimestamp);
        const asiaDate = new Date(asiaTimestamp);
        return utcDate.getUTCDate() === asiaDate.getUTCDate() - 1 ||
               (asiaDate.getUTCDate() === 1 && utcDate.getUTCMonth() === asiaDate.getUTCMonth() - 1);
      }
    ),
    { numRuns: 100 }
  );
});
```

**Property Test 8: Banner Type Classification**
```javascript
// Feature: banner-scraping-automation, Property 8: Banner type classification
test('banners are classified as test-run or upcoming', () => {
  fc.assert(
    fc.property(
      fc.array(fc.record({
        section: fc.constantFrom('Current', 'Upcoming'),
        // ... other fields
      })),
      (wikiBanners) => {
        const classified = classifyBanners(wikiBanners);
        return classified.every(b => 
          b.type === 'test-run' || b.type === 'upcoming'
        );
      }
    ),
    { numRuns: 100 }
  );
});
```

**Property Test 9: Required Fields Presence**
```javascript
// Feature: banner-scraping-automation, Property 9: Required fields presence
test('all generated banners have required fields', () => {
  fc.assert(
    fc.property(
      fc.array(fc.record({
        name: fc.string(),
        startDate: fc.integer(),
        endDate: fc.integer(),
        imageUrl: fc.string(),
        type: fc.string(),
        description: fc.string()
      })),
      (wikiBanners) => {
        const banners = convertToBannerObjects(wikiBanners, 'Genshin Impact');
        return banners.every(b =>
          b.title && b.start && b.end && 
          b.hasOwnProperty('image') && b.type && b.game && 
          b.hasOwnProperty('description')
        );
      }
    ),
    { numRuns: 100 }
  );
});
```

**Property Test 10: Character Escaping**
```javascript
// Feature: banner-scraping-automation, Property 10: Character escaping
test('special characters are properly escaped in generated code', () => {
  fc.assert(
    fc.property(
      fc.string(),
      (text) => {
        const escaped = escapeForJavaScript(text);
        const code = `const test = \`${escaped}\`;`;
        try {
          new Function(code);
          return true;
        } catch (e) {
          return false;
        }
      }
    ),
    { numRuns: 100 }
  );
});
```

### Integration Testing

Integration tests should verify:
1. **End-to-end scraping**: Run scraper against a mock wiki page
2. **File generation**: Verify output files are created with correct structure
3. **Image download**: Verify images are downloaded to correct directories
4. **GitHub Actions compatibility**: Test with headless Chromium flags

### Manual Testing

Manual verification should include:
1. Run each scraper locally and verify output
2. Check that images are downloaded correctly
3. Verify dates are converted correctly (compare with wiki)
4. Test with GitHub Actions workflow
5. Verify that existing banner data is preserved

## Implementation Notes

### Wiki Page Structure

Each game's wiki has a slightly different structure:

**Genshin Impact** (https://genshin-impact.fandom.com/wiki/Wish):
- Look for h2/h3 sections: "Current" and "Upcoming"
- Table columns: Event | Duration | Type
- Banner types: Character Event Wish, Weapon Event Wish

**Honkai: Star Rail** (https://honkai-star-rail.fandom.com/wiki/Events):
- Look for h2 sections: "Current" and "Upcoming"
- Table columns: Event | Duration | Type
- Banner types: Character Event Warp, Light Cone Event Warp

**Zenless Zone Zero** (https://zenless-zone-zero.fandom.com/wiki/Event):
- Look for h2/h3 sections: "Current" and "Upcoming"
- Table columns: Event | Duration | Type
- Banner types: Exclusive Channel, W-Engine Channel

### Reusing Existing Patterns

The banner scrapers should follow the same patterns as the existing event scrapers:

1. **Browser setup**: Same Puppeteer configuration
2. **Date parsing**: Same `parseWikiDate` and `monthToIndex` functions
3. **Image downloading**: Use existing `downloadImage` from `archiveUtils.js`
4. **File generation**: Same template literal approach for JavaScript code
5. **Error handling**: Same try-catch patterns with logging

### Differences from Event Scrapers

Key differences for banner scrapers:

1. **Banner types**: Use 'test-run' and 'upcoming' instead of event types
2. **Output files**: Three separate files instead of one per game
3. **Image directory**: `/banners/` instead of `/events/`
4. **No description scraping**: Banners may have simpler descriptions or none
5. **Simpler date logic**: Banners typically have consistent start/end times

### Performance Considerations

- Each scraper runs independently (parallel execution in GitHub Actions)
- Image downloads are sequential but skip existing files
- Browser is closed after each scraper completes
- Total execution time should be under 5 minutes per scraper

### Maintenance Considerations

- Wiki page structures may change over time
- Add logging to help diagnose parsing issues
- Use continue-on-error in GitHub Actions to prevent one failure from blocking others
- Consider adding a validation step to check output file structure
