// downloadMissingImages.js
// Downloads images only for events that are missing them
// Run with: node scripts/downloadMissingImages.js

import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { scrapedGenshinHistoryEvents } from '../src/data/scrapedGenshinHistoryEvents.js';
import { downloadImage } from './archiveUtils.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

puppeteerExtra.use(StealthPlugin());

console.log('Finding events with missing images...\n');

// Final 4 events that failed
const failedEventTitles = [
  'Mutual Security Enhancing Simulation',
  'Reminiscent Regimen: Thrill',
  'Heated Battle Mode: Tactical Formation',
  'The Forge Realm\'s Temper: Endless Swarm'
];

// Find events that don't have local images AND are in the failed list
const eventsNeedingImages = scrapedGenshinHistoryEvents.filter(event => {
  const needsImage = !event.image || event.image.startsWith('https://');
  const isInFailedList = failedEventTitles.some(title => event.title.includes(title) || title.includes(event.title));
  return needsImage && isInFailedList;
});

console.log(`Found ${eventsNeedingImages.length} failed events to retry\n`);

async function downloadMissingImages() {
  const browser = await puppeteerExtra.launch({
    headless: false,  // Changed to false so you can see it
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < eventsNeedingImages.length; i++) {
    const event = eventsNeedingImages[i];
    console.log(`\n[${i + 1}/${eventsNeedingImages.length}] ${event.title}`);
    console.log(`  URL: ${event.wikiUrl}`);

    try {
      // Navigate to event page with retry
      let navSuccess = false;
      for (let attempt = 1; attempt <= 3 && !navSuccess; attempt++) {
        try {
          if (attempt > 1) console.log(`  ⟳ Retry attempt ${attempt}/3...`);
          await page.goto(event.wikiUrl, {
            waitUntil: 'domcontentloaded', // Changed from networkidle2 for faster loading
            timeout: 90000
          });
          
          // Wait for Cloudflare challenge
          console.log(`  ⏳ Checking for Cloudflare...`);
          try {
            await page.waitForFunction(
              () => !document.title.includes('Just a moment'),
              { timeout: 60000 }
            );
            console.log(`  ✓ Cloudflare passed`);
          } catch (cfError) {
            console.log(`  ⚠ Cloudflare timeout (might be OK)`);
          }
          
          navSuccess = true;
        } catch (navError) {
          if (attempt === 3) {
            console.log(`  ✗ All navigation attempts failed: ${navError.message}`);
            failCount++;
            continue; // Skip to next event instead of throwing
          }
          console.log(`  ⚠ Navigation attempt ${attempt} failed, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
      }
      
      if (!navSuccess) continue; // Skip if navigation failed

      // Wait for Cloudflare
      try {
        await page.waitForFunction(
          () => !document.title.includes('Just a moment'),
          { timeout: 60000 }
        );
      } catch (e) {
        console.log('  ⚠ Cloudflare timeout (might be OK)');
      }

      // Wait for images to load instead of fixed timer
      console.log('  ⏳ Waiting for images to load...');
      try {
        await Promise.race([
          page.waitForSelector('img[data-image-key]', { timeout: 15000 }),
          page.waitForSelector('.mw-parser-output img', { timeout: 15000 }),
          new Promise(resolve => setTimeout(resolve, 5000)) // Fallback timeout
        ]);
        console.log('  ✓ Images loaded');
      } catch (e) {
        console.log('  ⚠ Image load timeout, continuing anyway');
      }

      // Get image directly from infobox thumbnail on event page
      console.log('  ⏳ Looking for infobox image...');
      const imageUrl = await page.evaluate(() => {
        const img = document.querySelector('img.pi-image-thumbnail');
        if (img && img.src) {
          // Remove /revision/latest?cb=... part to get clean image URL
          return img.src.split('/revision')[0];
        }
        return null;
      });

      if (!imageUrl) {
        console.log('  ✗ No infobox thumbnail found');
        failCount++;
        continue;
      }

      console.log(`  ✓ Found image URL: ${imageUrl}`);

      // Download image
      const localImage = await downloadImage(
        imageUrl,
        'genshin-impact',
        event.title,
        'events',
        ''
      );

      if (localImage) {
        console.log(`  ✓ Downloaded: ${localImage}`);
        successCount++;
      } else {
        console.log('  ✗ Download failed');
        failCount++;
      }

    } catch (error) {
      console.log(`  ✗ Error: ${error.message}`);
      failCount++;
    }

    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  await browser.close();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✓ Success: ${successCount}`);
  console.log(`✗ Failed: ${failCount}`);
  console.log(`Total: ${eventsNeedingImages.length}`);
  console.log('='.repeat(60));
}

downloadMissingImages();
