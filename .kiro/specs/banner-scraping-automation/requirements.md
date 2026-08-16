# Requirements Document

## Introduction

This document specifies the requirements for implementing automated banner scraping for the Event Horizon app, which tracks game events and banners for Genshin Impact, Honkai: Star Rail, and Zenless Zone Zero. The system will scrape banner data from game wikis, download banner images, and store the data in structured files that can be consumed by the application.

## Glossary

- **Banner**: A limited-time promotional feature in gacha games where players can obtain specific characters or weapons
- **Scraper**: An automated script that extracts data from web pages
- **Wiki**: A community-maintained website containing game information (Fandom wikis)
- **Test-Run Banner**: A banner type where players can try characters before obtaining them
- **Upcoming Banner**: A banner that has been announced but not yet released
- **Asia Server Time**: UTC+8 timezone used by the games for event timing
- **Puppeteer**: A Node.js library for controlling headless Chrome/Chromium browsers
- **GitHub Actions**: Automated workflow system that runs scripts on a schedule
- **Deduplication**: The process of identifying and removing duplicate entries based on unique keys

## Requirements

### Requirement 1: Scrape Genshin Impact Banners

**User Story:** As a system administrator, I want to automatically scrape Genshin Impact banner data from the wiki, so that users can see current and upcoming character/weapon banners.

#### Acceptance Criteria

1. WHEN the scraper runs, THE Genshin_Scraper SHALL fetch banner data from https://game8.co/games/Genshin-Impact/archives/305012
2. WHEN parsing banner data, THE Genshin_Scraper SHALL extract banner title, start date, end date, banner type, and image URL
3. WHEN a banner is found, THE Genshin_Scraper SHALL classify it as either 'test-run' or 'upcoming' type
4. WHEN banner dates are in Asia server time (UTC+8), THE Genshin_Scraper SHALL convert them to UTC timestamps
5. WHEN banner images are found, THE Genshin_Scraper SHALL download them to /public/images/genshin-impact/banners/
6. WHEN all banners are processed, THE Genshin_Scraper SHALL write the data to src/data/scrapedBanners.js
7. WHEN the scraper encounters network errors, THE Genshin_Scraper SHALL handle them gracefully and continue processing other banners

### Requirement 2: Scrape Honkai Star Rail Banners

**User Story:** As a system administrator, I want to automatically scrape Honkai: Star Rail banner data from the wiki, so that users can see current and upcoming warp banners.

#### Acceptance Criteria

1. WHEN the scraper runs, THE StarRail_Scraper SHALL fetch banner data from https://game8.co/games/Honkai-Star-Rail/archives/408381
2. WHEN parsing banner data, THE StarRail_Scraper SHALL extract banner title, start date, end date, banner type, and image URL
3. WHEN a banner is found, THE StarRail_Scraper SHALL classify it as either 'test-run' or 'upcoming' type
4. WHEN banner dates are in Asia server time (UTC+8), THE StarRail_Scraper SHALL convert them to UTC timestamps
5. WHEN banner images are found, THE StarRail_Scraper SHALL download them to /public/images/honkai-star-rail/banners/
6. WHEN all banners are processed, THE StarRail_Scraper SHALL write the data to src/data/scrapedStarRailBanners.js
7. WHEN the scraper encounters network errors, THE StarRail_Scraper SHALL handle them gracefully and continue processing other banners

### Requirement 3: Scrape Zenless Zone Zero Banners

**User Story:** As a system administrator, I want to automatically scrape Zenless Zone Zero banner data from the wiki, so that users can see current and upcoming signal search banners.

#### Acceptance Criteria

1. WHEN the scraper runs, THE ZZZ_Scraper SHALL fetch banner data from https://game8.co/games/Zenless-Zone-Zero/archives/435687
2. WHEN parsing banner data, THE ZZZ_Scraper SHALL extract banner title, start date, end date, banner type, and image URL
3. WHEN a banner is found, THE ZZZ_Scraper SHALL classify it as either 'test-run' or 'upcoming' type
4. WHEN banner dates are in Asia server time (UTC+8), THE ZZZ_Scraper SHALL convert them to UTC timestamps
5. WHEN banner images are found, THE ZZZ_Scraper SHALL download them to /public/images/zenless-zone-zero/banners/
6. WHEN all banners are processed, THE ZZZ_Scraper SHALL write the data to src/data/scrapedZZZBanners.js
7. WHEN the scraper encounters network errors, THE ZZZ_Scraper SHALL handle them gracefully and continue processing other banners

### Requirement 4: Handle Dynamic Content Loading

**User Story:** As a system administrator, I want the scrapers to handle dynamically loaded content, so that all banner data is captured even when loaded via JavaScript.

#### Acceptance Criteria

1. WHEN a wiki page loads content dynamically, THE Scraper SHALL wait for the content to be fully loaded before parsing
2. WHEN using Puppeteer, THE Scraper SHALL set appropriate wait conditions for DOM content
3. WHEN images are lazy-loaded, THE Scraper SHALL extract image URLs from both 'src' and 'data-src' attributes
4. WHEN the page uses MediaWiki API, THE Scraper SHALL fetch and parse the API response

### Requirement 5: Download and Store Banner Images

**User Story:** As a system administrator, I want banner images to be downloaded and stored locally, so that the app doesn't depend on external image hosting.

#### Acceptance Criteria

1. WHEN a banner image URL is found, THE Image_Downloader SHALL download the image to the appropriate game directory
2. WHEN downloading images, THE Image_Downloader SHALL create directory structure if it doesn't exist
3. WHEN an image already exists locally, THE Image_Downloader SHALL skip re-downloading it
4. WHEN an image download fails, THE Image_Downloader SHALL log the error and continue processing
5. WHEN saving images, THE Image_Downloader SHALL generate safe filenames from banner titles
6. WHEN an image is successfully downloaded, THE Image_Downloader SHALL return the local path in format /images/{game}/banners/{filename}

### Requirement 6: Convert Asia Server Time to UTC

**User Story:** As a system administrator, I want banner dates to be stored in UTC, so that the app can display correct times for users in any timezone.

#### Acceptance Criteria

1. WHEN parsing banner dates, THE Date_Converter SHALL recognize Asia server time (UTC+8) format
2. WHEN converting dates, THE Date_Converter SHALL subtract 8 hours to get UTC time
3. WHEN a date conversion results in a day change, THE Date_Converter SHALL adjust the date accordingly
4. WHEN generating timestamps, THE Date_Converter SHALL use JavaScript Date.UTC() for consistency
5. WHEN parsing date strings, THE Date_Converter SHALL handle formats like "February 09, 2026" and "Feb. 09, 2026"

### Requirement 7: Preserve Existing Banner Data

**User Story:** As a system administrator, I want manually added banners to be preserved, so that custom banner data isn't lost during automated scraping.

#### Acceptance Criteria

1. WHEN writing banner data, THE Data_Writer SHALL use title + start date as a unique key for deduplication
2. WHEN a banner with the same key exists, THE Data_Writer SHALL update it with new scraped data
3. WHEN a banner doesn't exist in scraped data, THE Data_Writer SHALL preserve it in the output file
4. WHEN merging data, THE Data_Writer SHALL maintain chronological order by start date

### Requirement 8: Generate JavaScript Data Files

**User Story:** As a system administrator, I want banner data to be written as JavaScript modules, so that the app can import and use the data.

#### Acceptance Criteria

1. WHEN generating output files, THE File_Generator SHALL create valid JavaScript ES6 module syntax
2. WHEN writing banner objects, THE File_Generator SHALL include all required fields: title, start, end, image, type, game, description
3. WHEN writing dates, THE File_Generator SHALL use new Date() constructor with ISO 8601 format
4. WHEN writing strings, THE File_Generator SHALL properly escape special characters
5. WHEN writing descriptions, THE File_Generator SHALL use template literals to preserve newlines
6. WHEN generating files, THE File_Generator SHALL include a timestamp comment indicating last update time

### Requirement 9: Run in GitHub Actions Environment

**User Story:** As a system administrator, I want the scrapers to work in GitHub Actions, so that banner data is automatically updated every hour.

#### Acceptance Criteria

1. WHEN running in GitHub Actions, THE Scraper SHALL use headless Chromium browser
2. WHEN running in GitHub Actions, THE Scraper SHALL use --no-sandbox and --disable-setuid-sandbox flags
3. WHEN a scraper fails, THE GitHub_Workflow SHALL continue running other scrapers
4. WHEN scrapers complete, THE GitHub_Workflow SHALL check for file changes before committing
5. WHEN banner data changes, THE GitHub_Workflow SHALL commit and push the changes automatically

### Requirement 10: Handle Error Conditions Gracefully

**User Story:** As a system administrator, I want the scrapers to handle errors gracefully, so that temporary failures don't break the entire automation.

#### Acceptance Criteria

1. WHEN a network request fails, THE Scraper SHALL log the error and continue processing
2. WHEN a wiki page structure changes, THE Scraper SHALL handle missing elements without crashing
3. WHEN an image download fails, THE Scraper SHALL use an empty string for the image path
4. WHEN date parsing fails, THE Scraper SHALL log the error and skip that banner
5. WHEN the browser fails to launch, THE Scraper SHALL exit with a non-zero status code
6. WHEN file writing fails, THE Scraper SHALL log the error and exit with a non-zero status code

### Requirement 11: Support Idempotent Execution

**User Story:** As a system administrator, I want the scrapers to be idempotent, so that running them multiple times produces consistent results.

#### Acceptance Criteria

1. WHEN a scraper runs multiple times with the same wiki data, THE Scraper SHALL produce identical output files
2. WHEN images already exist locally, THE Scraper SHALL not re-download them
3. WHEN banner data hasn't changed, THE Scraper SHALL not modify the output file timestamps
4. WHEN deduplicating banners, THE Scraper SHALL use consistent key generation logic
