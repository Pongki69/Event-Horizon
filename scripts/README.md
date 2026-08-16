# Event Scraping Scripts

This directory contains scripts to automatically scrape event data from various game wikis.

## Available Scrapers

### Genshin Impact (`scrapeGenshin.js`)
Scrapes event and banner data from Game8's Genshin Impact Events page.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Run the Genshin Impact scraper:
```bash
npm run scrape:genshin
```

## What it does

The script will:
1. Check if cached data exists (less than 24 hours old)
2. If cache is valid, use cached data (no scraping needed)
3. If cache is old or missing:
   - Launch a headless Chrome browser using Puppeteer
   - Navigate to Game8 Genshin Impact Events page
   - Find "List of Upcoming Events" and "List of Current Events" sections
   - Extract events from `<h3>` tags with their images and dates
   - Extract banners from "Character Test Runs" section
   - Parse dates from table rows (Event Start/Event End)
   - Save results to cache for future use
4. Generate JavaScript files with the event data:
   - `src/data/scrapedEvents.js` - Events data
   - `src/data/scrapedBanners.js` - Banner data

## Caching

The scraper uses a 24-hour cache to reduce load on Game8's servers:
- Cache file: `scripts/.scrape-cache.json`
- Cache duration: 24 hours
- To force re-scrape: Delete `scripts/.scrape-cache.json`

This means you can run `npm run scrape:genshin` as often as you want, and it will only actually scrape the website once per day.

## Using the scraped data

After running the script, import the scraped events in your `GameCalendar.tsx`:

```javascript
import { scrapedEvents } from '../data/scrapedEvents';
import { scrapedBanners } from '../data/scrapedBanners';

export const events = scrapedEvents;
```

## Troubleshooting

If the script fails:
- Make sure you have a stable internet connection
- Check if Game8 website is accessible in your browser
- The website structure may have changed - check the console output for errors
- If you see 503 errors, the site may be temporarily down - try again later
- Try running with `headless: false` in the script to see what's happening

## Updating data

Run `npm run scrape:genshin` to fetch the latest events. The scraper will:
- Use cached data if less than 24 hours old
- Re-scrape if cache is older than 24 hours
- Force re-scrape by deleting `scripts/.scrape-cache.json`

## Adding New Game Scrapers

To add a scraper for another game (e.g., Honkai Star Rail):
1. Create a new file: `scripts/scrapeStarRail.js`
2. Copy the structure from `scrapeGenshin.js`
3. Update the URL and scraping logic for the new game
4. Add a new script in `package.json`: `"scrape:starrail": "node scripts/scrapeStarRail.js"`
5. Update the game property in scraped data to match the Games card
