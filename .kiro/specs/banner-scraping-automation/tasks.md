# Implementation Plan: Banner Scraping Automation

## Overview

This implementation plan creates three banner scraper scripts following the established pattern from existing event scrapers. Each scraper will fetch banner data from game wikis, download images, and generate JavaScript data files. The scrapers will run hourly via the existing GitHub Actions workflow.

## Tasks

- [ ] 1. Create shared helper functions module
  - Create `scripts/bannerScraperUtils.js` with shared functions
  - Implement `parseWikiDate(dateStr)` for Asia time to UTC conversion
  - Implement `monthToIndex(monthName)` for month name parsing
  - Implement `generateSafeFilename(title)` for safe filename generation
  - Implement `escapeForJavaScript(text)` for string escaping
  - Implement `generateBannersCode(banners, gameName)` for JS file generation
  - _Requirements: 6.1, 6.2, 6.3, 6.5, 5.5, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [ ]* 1.1 Write property test for date conversion
  - **Property 1: Date Conversion Consistency**
  - **Validates: Requirements 6.2, 6.3, 6.4**

- [ ]* 1.2 Write property test for filename safety
  - **Property 6: Filename Safety**
  - **Validates: Requirements 5.5**

- [ ]* 1.3 Write property test for character escaping
  - **Property 10: Character Escaping**
  - **Validates: Requirements 8.4, 8.5**

- [ ]* 1.4 Write unit tests for date parsing edge cases
  - Test abbreviated month names (Feb., Mar., etc.)
  - Test single-digit days
  - Test invalid date formats
  - _Requirements: 6.5_

- [ ] 2. Implement Genshin Impact banner scraper
  - [ ] 2.1 Create `scripts/scrapeGenshinBanners.js`
    - Set up Puppeteer browser with headless mode and security flags
    - Navigate to https://game8.co/games/Genshin-Impact/archives/305012
    - Parse "Current" and "Upcoming" sections from Game8 tables
    - Extract banner data: title, duration, type, image URL
    - Convert Asia time dates to UTC timestamps
    - Download banner images using `downloadImage` from archiveUtils
    - Generate JavaScript code with banner data
    - Write to `src/data/scrapedBanners.js`
    - Handle errors gracefully with logging
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 4.3, 5.1, 5.2, 5.3, 5.4, 5.6, 10.1, 10.2, 10.3, 10.4_

- [ ]* 2.2 Write property test for banner type classification
  - **Property 8: Banner Type Classification**
  - **Validates: Requirements 1.3**

- [ ]* 2.3 Write property test for required fields presence
  - **Property 9: Required Fields Presence**
  - **Validates: Requirements 8.2**

- [ ]* 2.4 Write property test for error handling continuity
  - **Property 5: Error Handling Continuity**
  - **Validates: Requirements 1.7, 10.1, 10.3**

- [ ] 3. Implement Honkai Star Rail banner scraper
  - [ ] 3.1 Create `scripts/scrapeStarRailBanners.js`
    - Set up Puppeteer browser with headless mode and security flags
    - Navigate to https://honkai-star-rail.fandom.com/wiki/Events
    - Parse "Current" and "Upcoming" sections from wiki tables
    - Extract banner data: title, duration, type, image URL
    - Convert Asia time dates to UTC timestamps
    - Download banner images using `downloadImage` from archiveUtils
    - Generate JavaScript code with banner data
    - Write to `src/data/scrapedStarRailBanners.js`
    - Handle errors gracefully with logging
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 4.3, 5.1, 5.2, 5.3, 5.4, 5.6, 10.1, 10.2, 10.3, 10.4_

- [ ]* 3.2 Write property test for output file validity
  - **Property 4: Output File Validity**
  - **Validates: Requirements 8.1, 8.3, 8.4**

- [ ] 4. Implement Zenless Zone Zero banner scraper
  - [ ] 4.1 Create `scripts/scrapeZZZBanners.js`
    - Set up Puppeteer browser with headless mode and security flags
    - Navigate to https://zenless-zone-zero.fandom.com/wiki/Event
    - Parse "Current" and "Upcoming" sections from wiki tables
    - Extract banner data: title, duration, type, image URL
    - Convert Asia time dates to UTC timestamps
    - Download banner images using `downloadImage` from archiveUtils
    - Generate JavaScript code with banner data
    - Write to `src/data/scrapedZZZBanners.js`
    - Handle errors gracefully with logging
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.3, 5.1, 5.2, 5.3, 5.4, 5.6, 10.1, 10.2, 10.3, 10.4_

- [ ]* 4.2 Write property test for image download idempotence
  - **Property 2: Image Download Idempotence**
  - **Validates: Requirements 5.3, 11.2**

- [ ] 5. Implement banner deduplication logic
  - [ ] 5.1 Add deduplication function to bannerScraperUtils.js
    - Implement `deduplicateBanners(existingBanners, newBanners)` function
    - Use title + start date as unique key
    - Update existing banners with new data
    - Preserve banners not in new data
    - Sort by start date (newest first)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 11.4_

- [ ]* 5.2 Write property test for banner deduplication
  - **Property 3: Banner Deduplication**
  - **Validates: Requirements 7.1, 7.2, 11.4**

- [ ]* 5.3 Write unit tests for deduplication edge cases
  - Test with no existing banners
  - Test with no new banners
  - Test with all duplicates
  - Test with no duplicates
  - _Requirements: 7.1, 7.2, 7.3_

- [ ] 6. Integrate deduplication into scrapers
  - [ ] 6.1 Update scrapeGenshinBanners.js to use deduplication
    - Load existing banners from scrapedBanners.js
    - Merge with newly scraped banners
    - Write deduplicated data to file
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ] 6.2 Update scrapeStarRailBanners.js to use deduplication
    - Load existing banners from scrapedStarRailBanners.js
    - Merge with newly scraped banners
    - Write deduplicated data to file
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ] 6.3 Update scrapeZZZBanners.js to use deduplication
    - Load existing banners from scrapedZZZBanners.js
    - Merge with newly scraped banners
    - Write deduplicated data to file
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [ ] 7. Checkpoint - Test scrapers locally
  - Run each scraper locally and verify output files
  - Check that images are downloaded to correct directories
  - Verify dates are converted correctly
  - Ensure all tests pass, ask the user if questions arise.

- [ ]* 8. Write property test for idempotent execution
  - **Property 11: Idempotent Execution**
  - **Validates: Requirements 11.1, 11.2, 11.4**

- [ ]* 9. Write integration tests
  - Test end-to-end scraping with mock wiki pages
  - Test file generation with various banner data
  - Test image download with mock URLs
  - _Requirements: 1.1-1.7, 2.1-2.7, 3.1-3.7_

- [ ] 10. Update package.json scripts
  - Add `"scrape:genshin-banners": "node scripts/scrapeGenshinBanners.js"`
  - Add `"scrape:starrail-banners": "node scripts/scrapeStarRailBanners.js"`
  - Add `"scrape:zzz-banners": "node scripts/scrapeZZZBanners.js"`
  - Add `"scrape:all-banners": "npm run scrape:genshin-banners && npm run scrape:starrail-banners && npm run scrape:zzz-banners"`

- [ ] 11. Test GitHub Actions workflow
  - Trigger workflow manually to test all three scrapers
  - Verify that scrapers run successfully in GitHub Actions environment
  - Check that files are committed and pushed correctly
  - Verify continue-on-error behavior if one scraper fails
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 12. Final checkpoint - Verify automation
  - Wait for hourly workflow to run automatically
  - Verify banner data is updated correctly
  - Check that no errors occur in production
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The scrapers follow the same pattern as existing event scrapers for consistency
- Deduplication ensures manually added banners are preserved
- GitHub Actions workflow is already configured and ready to use
