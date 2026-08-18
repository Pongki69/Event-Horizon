// scrapeStarRailCurrentUpcoming.js
// Script to scrape Honkai Star Rail current and upcoming events from Game8
// Run with: node scripts/scrapeStarRailCurrentUpcoming.js

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadArchive, saveArchive, mergeWithArchive, getArchivePath, downloadImage, loadExistingImages, resolveImage } from './archiveUtils.js';
import { loginToFandom } from './fandomLogin.js';

// Use stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Wait for Cloudflare Turnstile challenge to complete
 */
async function waitForCloudflareChallenge(page, timeout = 30000) {
  try {
    console.log(`    Waiting for Cloudflare challenge to complete...`);
    
    // Wait for either the challenge to complete or timeout
    await page.waitForFunction(
      () => {
        // Check if we're still on the challenge page
        const challengeText = document.body.textContent || '';
        const isChallengePage = challengeText.includes('Performing security verification') || 
                               challengeText.includes('Verifying you are human') ||
                               challengeText.includes('Cloudflare');
        
        // If not on challenge page, we're good
        if (!isChallengePage) {
          return true;
        }
        
        // Check if page has actual content (not just challenge)
        const hasContent = document.querySelector('figure') || 
                          document.querySelector('.pi-image-thumbnail') ||
                          document.querySelector('.mw-parser-output') ||
                          document.querySelectorAll('p').length > 3;
        
        return hasContent;
      },
      { timeout, polling: 500 }
    );
    
    console.log(`    ✓ Cloudflare challenge passed`);
    return true;
  } catch (error) {
    console.log(`    ✗ Cloudflare challenge timeout or failed: ${error.message}`);
    return false;
  }
}

/**
 * Resolve actual image URL from wiki event page
 * Returns empty string if image doesn't exist or can't be resolved
 */
async function resolveWikiImageUrl(page, eventUrl, eventName, imageAlt, imageKey) {
  try {
    // Skip if no event URL
    if (!eventUrl || !eventUrl.includes('/wiki/')) {
      return '';
    }
    
    // Skip File: and Special: pages
    if (eventUrl.includes('/File:') || eventUrl.includes('/Special:')) {
      return '';
    }
    
    console.log(`  Navigating to event page: ${eventUrl.substring(0, 80)}...`);
    console.log(`  Full URL: ${eventUrl}`);
    
    try {
      // Removed verbose console logging for cleaner output
      // page.on('console', msg => {
      //   const text = msg.text();
      //   if (!text.includes('Failed to load resource') && !text.includes('JSHandle')) {
      //     console.log(`    [PAGE]: ${text}`);
      //   }
      // });
      
      const response = await page.goto(eventUrl, { 
        waitUntil: 'domcontentloaded', 
        timeout: 30000,
        referer: 'https://honkai-star-rail.fandom.com/wiki/Events'
      });
      
      console.log(`  Response status: ${response.status()}`);
      console.log(`  Final URL after navigation: ${page.url()}`);
      
      // Wait for Cloudflare challenge to complete
      const challengePassed = await waitForCloudflareChallenge(page, 45000);
      
      if (!challengePassed) {
        console.log(`  ✗ Could not pass Cloudflare challenge`);
        return '';
      }
      
      // Wait for page to fully load after challenge (2 seconds)
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Look for <figure class="pi-item pi-image"> and get the data-image-key
      const imageData = await page.evaluate(() => {
        // Debug: Check what figures exist on the page
        const allFigures = document.querySelectorAll('figure');
        console.log(`Found ${allFigures.length} figure elements on page`);
        
        // Debug: Check for pi-item elements
        const piItems = document.querySelectorAll('.pi-item');
        console.log(`Found ${piItems.length} .pi-item elements`);
        
        // Debug: Check for pi-image elements
        const piImages = document.querySelectorAll('.pi-image');
        console.log(`Found ${piImages.length} .pi-image elements`);
        
        // Debug: Check for figures with data-source attribute
        const figuresWithDataSource = document.querySelectorAll('figure[data-source]');
        console.log(`Found ${figuresWithDataSource.length} figure[data-source] elements`);
        if (figuresWithDataSource.length > 0) {
          figuresWithDataSource.forEach((fig, idx) => {
            console.log(`  Figure ${idx}: data-source="${fig.getAttribute('data-source')}", classes="${fig.className}"`);
          });
        }
        
        // Find figure with data-source="image"
        const figure = document.querySelector('figure.pi-item.pi-image[data-source="image"]');
        if (figure) {
          // Find the <img> inside the figure
          const img = figure.querySelector('img');
          if (img) {
            const dataImageKey = img.getAttribute('data-image-key') || '';
            console.log(`Found figure with img data-image-key: "${dataImageKey}"`);
            return { dataImageKey };
          }
        }
        
        console.log(`No figure.pi-item.pi-image[data-source="image"] found`);
        return { dataImageKey: '' };
      });
      
      if (imageData.dataImageKey) {
        console.log(`  ✓ Found data-image-key: ${imageData.dataImageKey}`);
        
        // Construct the URL with ?file= parameter (properly URL encoded)
        const imagePageUrl = `${eventUrl}?file=${encodeURIComponent(imageData.dataImageKey)}`;
        console.log(`  Navigating to image page: ${imagePageUrl.substring(0, 100)}...`);
        
        await page.goto(imagePageUrl, { 
          waitUntil: 'domcontentloaded', 
          timeout: 30000,
          referer: eventUrl
        });
        
        // Wait for Cloudflare challenge on image page
        const challengePassed2 = await waitForCloudflareChallenge(page, 45000);
        
        if (!challengePassed2) {
          console.log(`  ✗ Could not pass Cloudflare challenge on image page`);
          return '';
        }
        
        // Wait for the actual file page content to load by waiting for specific elements
        console.log(`  Waiting for file page elements to load...`);
        try {
          // Wait for either the "See full-size image" link OR the main image to appear
          await Promise.race([
            page.waitForSelector('a.see-full-size-link', { timeout: 15000 }),
            page.waitForSelector('img.fullMedia', { timeout: 15000 }),
            page.waitForSelector('.fullImageLink img', { timeout: 15000 })
          ]);
          console.log(`  ✓ File page elements loaded`);
        } catch (error) {
          console.log(`  ⟳ Elements not found, trying page refresh...`);
          await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
          await waitForCloudflareChallenge(page, 45000);
          
          try {
            await Promise.race([
              page.waitForSelector('a.see-full-size-link', { timeout: 15000 }),
              page.waitForSelector('img.fullMedia', { timeout: 15000 }),
              page.waitForSelector('.fullImageLink img', { timeout: 15000 })
            ]);
            console.log(`  ✓ File page elements loaded after refresh`);
          } catch (retryError) {
            console.log(`  ✗ Could not load file page elements after retry`);
            return '';
          }
        }
        
        // Additional wait for dynamic content
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Look for the "See full-size image" link
        const fullSizeData = await page.evaluate(() => {
          const link = document.querySelector('a.see-full-size-link');
          console.log(`Looking for "See full-size image" link...`);
          console.log(`Found link: ${link ? 'YES' : 'NO'}`);
          if (link) {
            console.log(`Link href: ${link.href}`);
          }
          return link ? { href: link.href, found: true } : { href: null, found: false };
        });
        
        if (fullSizeData.found && fullSizeData.href) {
          console.log(`  ✓ Found "See full-size image" link: ${fullSizeData.href.substring(0, 80)}...`);
          
          // Wait before navigating to full-size image (3 seconds)
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Navigate to the full-size image URL
          await page.goto(fullSizeData.href, { 
            waitUntil: 'domcontentloaded', 
            timeout: 30000,
            referer: imagePageUrl
          });
          
          // Wait for Cloudflare challenge on full-size page
          const challengePassed3 = await waitForCloudflareChallenge(page, 45000);
          
          if (!challengePassed3) {
            console.log(`  ✗ Could not pass Cloudflare challenge on full-size page`);
            return '';
          }
          
          // Wait for image to load (8 seconds)
          await new Promise(resolve => setTimeout(resolve, 8000));
        } else {
          console.log(`  ℹ No "See full-size image" link found, using current page`);
        }
        
        // Get the actual full-resolution image URL from the page
        // Add retry logic to handle detached frame issues
        let actualImageUrl = { src: '', width: 0, height: 0 };
        let retries = 3;
        
        while (retries > 0 && !actualImageUrl.src) {
          try {
            actualImageUrl = await page.evaluate(() => {
              // Look for the main image on the page
              console.log('Looking for image on page...');
              
              const fullMedia = document.querySelector('img.fullMedia');
              const fullImageLink = document.querySelector('.fullImageLink img');
              const filePageImage = document.querySelector('.fullImageLink a img, .fullMedia, img[src*="/revision/latest"]');
              
              console.log(`img.fullMedia: ${fullMedia ? 'FOUND' : 'NOT FOUND'}`);
              console.log(`fullImageLink img: ${fullImageLink ? 'FOUND' : 'NOT FOUND'}`);
              console.log(`filePageImage: ${filePageImage ? 'FOUND' : 'NOT FOUND'}`);
              
              const mainImage = fullMedia || fullImageLink || filePageImage;
              
              if (mainImage) {
                const src = mainImage.src || mainImage.getAttribute('data-src') || '';
                const width = mainImage.naturalWidth || mainImage.width || 0;
                const height = mainImage.naturalHeight || mainImage.height || 0;
                console.log(`Image src: ${src.substring(0, 100)}...`);
                console.log(`Image dimensions: ${width}x${height}`);
                // Skip if it's the site logo or navigation images
                if (src.includes('Site-logo') || src.includes('wiki-wordmark') || src.includes('data:image')) {
                  console.log('Skipping site logo/navigation image');
                  return { src: '', width: 0, height: 0 };
                }
                return { src, width, height };
              }
              return { src: '', width: 0, height: 0 };
            });
            
            if (!actualImageUrl.src) {
              retries--;
              if (retries > 0) {
                console.log(`  ⟳ Image not found, retrying... (${retries} attempts left)`);
                await new Promise(resolve => setTimeout(resolve, 5000));
              }
            }
          } catch (error) {
            retries--;
            if (error.message.includes('detached Frame')) {
              console.log(`  ⟳ Detached frame error, retrying... (${retries} attempts left)`);
              if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, 5000));
              }
            } else {
              throw error;
            }
          }
        }
        
        if (actualImageUrl.src && !actualImageUrl.src.startsWith('data:')) {
          // Remove any scaling parameters to get full resolution
          const cleanUrl = actualImageUrl.src.replace(/\/scale-to-width-down\/\d+/g, '');
          console.log(`  ✓ Resolved full-resolution image URL: ${cleanUrl.substring(0, 100)}...`);
          console.log(`  ✓ Image dimensions: ${actualImageUrl.width}x${actualImageUrl.height}`);
          return cleanUrl;
        } else {
          console.log(`  ✗ No valid image found on image page`);
        }
      } else {
        console.log(`  ✗ No data-image-key found on event page`);
      }
      
      return '';
    } catch (resolveError) {
      console.log(`  ✗ Could not resolve image: ${resolveError.message}`);
      return '';
    }
  } catch (error) {
    console.log(`  ✗ Error resolving image: ${error.message}`);
    return '';
  }
}/**
 * Fetch character description and image from Honkai Star Rail wiki
 */
async function fetchStarRailCharacterDescription(page, characterName) {
  try {
    // Replace spaces with underscores for HSR wiki URLs
    const wikiName = characterName.replace(/\s+/g, '_');
    const mediaUrl = `https://honkai-star-rail.fandom.com/wiki/${encodeURIComponent(wikiName)}/Media`;
    console.log(`  Fetching image for: ${characterName} from ${mediaUrl}`);
    
    // First, get the character image from Media page
    await page.goto(mediaUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const characterImage = await page.evaluate(() => {
      // Find h2 with "Character Introduction"
      const h2Elements = document.querySelectorAll('h2');
      let characterIntroH2 = null;
      
      for (const h2 of h2Elements) {
        if (h2.textContent.includes('Character Introduction')) {
          characterIntroH2 = h2;
          break;
        }
      }
      
      if (!characterIntroH2) {
        return '';
      }
      
      // Find the next image after the h2
      let element = characterIntroH2.nextElementSibling;
      while (element) {
        const img = element.querySelector('img');
        if (img) {
          let src = img.getAttribute('data-src') || img.getAttribute('src') || '';
          // Get the full resolution image URL
          if (src && !src.startsWith('http')) {
            if (src.startsWith('//')) {
              src = 'https:' + src;
            } else if (src.startsWith('/')) {
              src = 'https://static.wikia.nocookie.net' + src;
            }
          }
          // Remove any scaling parameters to get full resolution
          src = src.split('/revision/')[0];
          return src;
        }
        element = element.nextElementSibling;
        // Stop at next h2
        if (element && element.tagName === 'H2') break;
      }
      
      return '';
    });
    
    console.log(`  Image URL: ${characterImage ? characterImage.substring(0, 80) + '...' : 'Not found'}`);
    
    // Now get the description from Lore page
    const loreUrl = `https://honkai-star-rail.fandom.com/wiki/${encodeURIComponent(wikiName)}/Lore`;
    console.log(`  Fetching description for: ${characterName} from ${loreUrl}`);
    
    await page.goto(loreUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const description = await page.evaluate(() => {
      // Find all h2 elements
      const h2Elements = document.querySelectorAll('h2');
      let characterIntroH2 = null;
      
      // Look for h2 that contains "Character Introduction"
      for (const h2 of h2Elements) {
        if (h2.textContent.includes('Character Introduction')) {
          characterIntroH2 = h2;
          break;
        }
      }
      
      if (!characterIntroH2) {
        return '';
      }
      
      // Get the next sibling div after the h2
      let parentDiv = characterIntroH2.nextElementSibling;
      
      if (parentDiv && parentDiv.tagName === 'DIV') {
        // Get the first div with class srw-description-content
        const descriptionDiv = parentDiv.querySelector('.srw-description-content');
        
        if (descriptionDiv) {
          // Get innerText which preserves line breaks and removes HTML tags
          const text = descriptionDiv.innerText
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .join('\n')
            .replace(/\[\d+\]/g, ''); // Remove citation numbers like [1], [2], etc.
          
          return text;
        }
      }
      
      return '';
    });
    
    if (description) {
      console.log(`  ✓ Description found: ${description.substring(0, 100)}...`);
    } else {
      console.log(`  ✗ No description found for ${characterName}`);
    }
    
    return { description, image: characterImage };
  } catch (error) {
    console.log(`  ✗ Failed to fetch data for ${characterName}: ${error.message}`);
    return { description: '', image: '' };
  }
}

async function scrapeStarRailEvents() {
  console.log('\n🚀 Starting Honkai Star Rail events scraping...\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });

  try {
    const page = await browser.newPage();
    
    // Set large viewport to ensure full-resolution images are loaded
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Set realistic browser user agent only - let stealth plugin handle the rest
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    await loginToFandom(page);

    // Use MediaWiki API to bypass Cloudflare - same approach as Genshin scraper
    console.log('Fetching events from HSR Wiki API...');
    let wikiEvents = [];
    
    await page.goto('about:blank', { waitUntil: 'domcontentloaded' });
    
    const apiUrl = 'https://honkai-star-rail.fandom.com/api.php?action=parse&page=Events&prop=text&format=json&origin=*';
    
    const apiResponse = await page.evaluate(async (url) => {
      try {
        const response = await fetch(url);
        return await response.json();
      } catch (error) {
        return { error: error.message };
      }
    }, apiUrl);

    if (!apiResponse || !apiResponse.parse || !apiResponse.parse.text) {
      console.log('❌ Failed to get wiki content via API');
      console.log('No events found. Exiting.');
      return { events: [], historyEvents: [] };
    }
    
    console.log('✅ Successfully got wiki content via API');
    console.log('Extracting events from page...');
    
    // Extract events directly from the API HTML content
    wikiEvents = await page.evaluate((htmlContent) => {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = htmlContent;
      
      const events = [];
      
      // Find both "Current" and "Upcoming" sections
      const sections = ['Current', 'Upcoming'];
      
      for (const sectionName of sections) {
        console.log(`Looking for ${sectionName} section...`);
        
        // Look for h2 with span id="Current" or id="Upcoming"
        const sectionHeader = Array.from(tempDiv.querySelectorAll('h2')).find(h => {
          const span = h.querySelector(`span[id="${sectionName}"]`);
          return span || h.textContent.includes(sectionName);
        });

        console.log(`Found ${sectionName} header:`, !!sectionHeader);

        if (sectionHeader) {
          // Find the table after the section header
          let nextElement = sectionHeader.nextElementSibling;
          while (nextElement && nextElement.tagName !== 'TABLE') {
            nextElement = nextElement.nextElementSibling;
          }

              console.log(`Found table after ${sectionName} header:`, !!nextElement);

              if (nextElement && nextElement.tagName === 'TABLE') {
                const rows = nextElement.querySelectorAll('tr');
                console.log(`Number of table rows in ${sectionName}:`, rows.length);

                for (let i = 1; i < rows.length; i++) { // Skip header row
                  const row = rows[i];
                  const cells = row.querySelectorAll('td');
                  console.log(`Row ${i} in ${sectionName}: ${cells.length} cells`);

                  if (cells.length >= 3) {
                    const eventCell = cells[0];
                    const durationCell = cells[1];
                    const typeCell = cells[2];

                    // Get event name and links
                    // Multiple <a> tags may exist: image link, title link, etc.
                    const allLinks = eventCell.querySelectorAll('a');
                    const eventImage = eventCell.querySelector('img');

                    console.log(`Row ${i} in ${sectionName}: Links found: ${allLinks.length}, Image found: ${!!eventImage}`);

                    // Find the best link for the event title (skip image links)
                    let eventLink = null;
                    let eventName = '';
                    
                    for (const link of allLinks) {
                      const href = link.getAttribute('href') || '';
                      const text = link.textContent.trim();
                      
                      // Skip image/file links
                      if (href.includes('/File:') || href.includes('/Special:')) {
                        continue;
                      }
                      
                      // Skip empty links
                      if (!text || text.includes('File:') || text.match(/\.(png|jpg|jpeg)$/i)) {
                        continue;
                      }
                      
                      // This should be the event title link
                      eventLink = link;
                      eventName = text;
                      break;
                    }
                    
                    // Fallback: if no good link found, use image alt or first link
                    if (!eventName && eventImage) {
                      eventName = eventImage.getAttribute('alt') || '';
                    }
                    if (!eventName && allLinks.length > 0) {
                      eventName = allLinks[0].textContent.trim();
                    }
                    
                    // Clean up the event name
                    eventName = eventName.replace(/^File:Event\s+/i, '').replace(/\.(png|jpg|jpeg)$/i, '');

                    if (eventLink && eventName && durationCell.textContent.trim()) {
                      // Get the event URL from the <a> tag in the Event column
                      let eventUrl = eventLink.getAttribute('href') || '';
                    
                    // Fix relative URLs
                    if (eventUrl && eventUrl.startsWith('/wiki/')) {
                      eventUrl = 'https://honkai-star-rail.fandom.com' + eventUrl;
                    }
                    
                    // Debug: Log the extracted URL
                    console.log(`Row ${i} in ${sectionName}: Event="${eventName}", URL="${eventUrl}"`);
                    
                    const duration = durationCell.textContent.trim();
                    const eventType = typeCell.textContent.trim();

                    // Get image URL and data-image-key if available
                    let imageUrl = '';
                    let imageAlt = '';
                    let imageKey = '';
                    if (eventImage) {
                      imageUrl = eventImage.getAttribute('src') || eventImage.getAttribute('data-src') || '';
                      imageAlt = eventImage.getAttribute('alt') || '';
                      imageKey = eventImage.getAttribute('data-image-key') || eventImage.getAttribute('data-image-name') || '';
                      
                      // Debug: log what attributes the image has
                      console.log(`Image for ${eventName}: src=${!!imageUrl}, alt=${!!imageAlt}, data-image-key=${!!imageKey}`);
                      if (imageKey) {
                        console.log(`  Found imageKey: ${imageKey}`);
                      }
                      
                      // Convert relative URLs to absolute
                      if (imageUrl && imageUrl.startsWith('//')) {
                        imageUrl = 'https:' + imageUrl;
                      } else if (imageUrl && imageUrl.startsWith('/')) {
                        imageUrl = 'https://honkai-star-rail.fandom.com' + imageUrl;
                      }
                    }

                    // Extract any additional text content from the event cell
                    const eventDescription = eventCell.textContent.replace(eventName, '').trim();

                    events.push({
                      name: eventName,
                      duration: duration,
                      type: eventType,
                      url: eventUrl,
                      imageUrl: imageUrl,
                      imageAlt: imageAlt,
                      imageKey: imageKey,
                      description: eventDescription,
                      rawEventCell: eventCell.innerHTML
                    });
                    
                      // Debug: log the extracted data
                      console.log(`Extracted event from ${sectionName}: ${eventName}, URL: ${eventUrl}, Image: ${imageUrl ? 'Yes' : 'No'}`);
                    }
                  }
                }
              }
            }
          }
          
          return events;
        }, apiResponse.parse.text['*']);

    console.log(`\n📋 Found ${wikiEvents.length} events from wiki (Current + Upcoming)`);

    // Deduplicate events based on image URL (same image = same event)
    const seenImages = new Map();
    const uniqueEvents = [];
    
    for (const event of wikiEvents) {
      const imageKey = event.imageUrl || event.imageKey || event.imageAlt || event.name;
      
      if (seenImages.has(imageKey)) {
        const existing = seenImages.get(imageKey);
        console.log(`⚠️  Duplicate detected: "${event.name}" (same image as "${existing.name}") - skipping`);
        continue;
      }
      
      seenImages.set(imageKey, event);
      uniqueEvents.push(event);
    }
    
    console.log(`📋 After deduplication: ${uniqueEvents.length} unique events\n`);
    wikiEvents = uniqueEvents;

    // Process wiki events only and get detailed descriptions
    const allEvents = [];

    // Process wiki events (these have official timing)
    for (const wikiEvent of wikiEvents) {
      // Parse duration format: "February 09, 2026 – February 23, 2026"
      const durationMatch = wikiEvent.duration.match(/([A-Za-z]+ \d{1,2}, \d{4})\s*[–-]\s*([A-Za-z]+ \d{1,2}, \d{4}|Permanent)/i);

      if (durationMatch) {
        const [, startDateStr, endDateStr] = durationMatch;

        // Parse dates using official wiki format
        const startDate = parseWikiDate(startDateStr);
        let endDate;
        let isPermanent = false;
        
        if (endDateStr.toLowerCase() === 'permanent') {
          // For permanent events, set end date to 30 days from start
          isPermanent = true;
          endDate = startDate + (30 * 24 * 60 * 60 * 1000);
          console.log(`  ℹ Event is permanent, setting 30-day calendar display`);
        } else {
          endDate = parseWikiDate(endDateStr);
        }

        if (startDate && endDate) {
          // Use intelligent event type detection for accurate timing
          let actualStartDate = startDate;
          let actualEndDate = endDate;
          let serverTimeInfo = '';
          let eventDescription = '';
          
          const eventTitle = wikiEvent.name.toLowerCase();
          let endHourGMT8 = 3; // Default: 03:59 GMT+8
          let matchedPattern = 'default (03:59 AM)';
          
          // Different event types have different end times based on official patterns
          if (eventTitle.includes('planar fissure') || 
              eventTitle.includes('realm of the strange') ||
              eventTitle.includes('double drop')) {
            endHourGMT8 = 5; // 05:59 GMT+8
            matchedPattern = 'planar/realm (05:59 AM)';
            serverTimeInfo = '05:59 AM Server Time';
          }
          else if (eventTitle.includes('cosmicon') ||
                   eventTitle.includes('arcadia') ||
                   eventTitle.includes('flip of fortune')) {
            endHourGMT8 = 6; // 06:59 GMT+8
            matchedPattern = 'cosmicon/arcadia (06:59 AM)';
            serverTimeInfo = '06:59 AM Server Time';
          }
          else {
            serverTimeInfo = '03:59 AM Server Time';
          }
          
          // Update the end date with the correct server time if different from default
          if (endHourGMT8 !== 3) {
            // The endDate from parseWikiDate is in GMT+8 (03:59)
            // We just need to adjust the hour component
            const endDateObj = new Date(endDate);
            endDateObj.setUTCHours(endHourGMT8, 59, 0, 0);
            actualEndDate = endDateObj.getTime();
            
            console.log(`Applied timing pattern for ${wikiEvent.name}: ${matchedPattern}`);
          }
          
          // Fetch event description and end time from the event page
          let extractedEndTime = null;
          if (wikiEvent.url && wikiEvent.url.includes('/wiki/') && !wikiEvent.url.includes('/File:') && !wikiEvent.url.includes('/Special:')) {
            try {
              console.log(`\n📄 Fetching description for: ${wikiEvent.name}`);
              
              await page.goto(wikiEvent.url, { 
                waitUntil: 'domcontentloaded', 
                timeout: 10000 
              });
              
              // Wait for content to load
              await page.waitForSelector('.srw-description-content, p', { timeout: 5000 }).catch(() => {
                console.log('  ⚠ Content not found');
              });
              
              // Extract description and page title from the event page
              const pageData = await page.evaluate(() => {
                // Get the page title from data-source="name" (most accurate)
                let pageTitle = '';
                const nameElement = document.querySelector('[data-source="name"]');
                if (nameElement) {
                  pageTitle = nameElement.textContent.trim();
                } else {
                  // Fallback to h1
                  const h1Element = document.querySelector('h1.page-header__title');
                  if (h1Element) {
                    pageTitle = h1Element.textContent.trim();
                  } else {
                    // Fallback to document title, remove " | Honkai: Star Rail Wiki | Fandom" suffix
                    pageTitle = document.title.split('|')[0].trim();
                  }
                }
                
                const descElement = document.querySelector('.srw-description-content');
                let description = '';
                if (descElement) {
                  description = descElement.innerText || descElement.textContent || '';
                }
                
                // Fallback: If no description found, try to get the first <p> after <div class="countdownevent hidden">
                if (!description) {
                  const countdownDiv = document.querySelector('.countdownevent.hidden');
                  if (countdownDiv) {
                    // Find the next <p> element after the countdown div
                    let nextElement = countdownDiv.nextElementSibling;
                    while (nextElement) {
                      if (nextElement.tagName === 'P') {
                        description = nextElement.innerText || nextElement.textContent || '';
                        break;
                      }
                      // Also check if there's a <p> inside the next element
                      const pInside = nextElement.querySelector('p');
                      if (pInside) {
                        description = pInside.innerText || pInside.textContent || '';
                        break;
                      }
                      nextElement = nextElement.nextElementSibling;
                    }
                  }
                }
                
                // Extract times from the infobox
                let endTime = null;
                let startTime = null;
                const allText = document.body.textContent || '';
                
                // Look for data-source attributes in table cells (most reliable)
                const startCell = document.querySelector('td[data-source="time_start"]');
                const endCell = document.querySelector('td[data-source="time_end"]');
                
                if (startCell) {
                  const startText = startCell.textContent || '';
                  console.log(`DEBUG: startCell text: "${startText}"`);
                  // Match format: "5 November, 2025 11:00 GMT+8" or "26 February, 2026 16:00 UTC-8"
                  // Handles: GMT+8, GMT-8, UTC+8, UTC-8, Server Time, or just time
                  const startMatch = startText.match(/(\d{1,2}):(\d{2})(?:\s*(?:GMT|UTC)\s*([+-])\s*(\d+)|\s*Server\s*Time)?/i);
                  if (startMatch) {
                    const hour = parseInt(startMatch[1]);
                    const minute = parseInt(startMatch[2]);
                    const sign = startMatch[3];
                    const offset = startMatch[4];
                    // If timezone found, use it; otherwise default to UTC+8 (Server Time)
                    const timezone = (sign && offset) ? `UTC${sign}${offset}` : 'UTC+8';
                    startTime = { hour, minute, timezone };
                  }
                }
                
                if (endCell) {
                  const endText = endCell.textContent || '';
                  console.log(`DEBUG: endCell text: "${endText}"`);
                  // Match format: "25 March, 2026 06:00 GMT+8" or "4 April, 2026 16:00 UTC-8" or "Server Time"
                  // Handles: GMT+8, GMT-8, UTC+8, UTC-8, Server Time, or just time
                  const endMatch = endText.match(/(\d{1,2}):(\d{2})(?:\s*(?:GMT|UTC)\s*([+-])\s*(\d+)|\s*Server\s*Time)?/i);
                  if (endMatch) {
                    const hour = parseInt(endMatch[1]);
                    const minute = parseInt(endMatch[2]);
                    const sign = endMatch[3];
                    const offset = endMatch[4];
                    // If timezone found, use it; otherwise default to UTC+8 (Server Time)
                    const timezone = (sign && offset) ? `UTC${sign}${offset}` : 'UTC+8';
                    endTime = { hour, minute, timezone };
                  }
                }
                
                // If end time not found via data-source, look for it in the Duration table
                // The structure is usually: Start row, then End row
                if (!endTime) {
                  // Find all table rows that contain "Start" or "End"
                  const rows = Array.from(document.querySelectorAll('tr'));
                  let foundStart = false;
                  for (const row of rows) {
                    const rowText = row.textContent || '';
                    if (rowText.toLowerCase().includes('start') && !rowText.toLowerCase().includes('restart')) {
                      foundStart = true;
                    } else if (foundStart && rowText.toLowerCase().includes('end') && !rowText.toLowerCase().includes('weekend')) {
                      // This should be the End row - extract time from it
                      const timeMatch = rowText.match(/(\d{1,2}):(\d{2})(?:\s*(?:GMT|UTC)\s*([+-])\s*(\d+)|\s*Server\s*Time)?/i);
                      if (timeMatch) {
                        const hour = parseInt(timeMatch[1]);
                        const minute = parseInt(timeMatch[2]);
                        const sign = timeMatch[3];
                        const offset = timeMatch[4];
                        const timezone = (sign && offset) ? `UTC${sign}${offset}` : 'UTC+8';
                        endTime = { hour, minute, timezone };
                        break;
                      }
                    }
                  }
                }
                
                // Fallback: Look for GMT+8 or UTC-8 times in text
                // Note: GMT+8/UTC+8 = 8 hours ahead of UTC (Asia time)
                //       UTC-8 = 8 hours behind UTC (Pacific time)
                
                if (!endTime) {
                  // Get the end date from the duration to search for the specific date's time
                  const durationMatch = wikiEvent.duration.match(/[–-]\s*([A-Za-z]+ \d{1,2}, \d{4})/);
                  const endDateStr = durationMatch ? durationMatch[1] : null;
                  
                  // Find "End" position in text
                  const endPos = allText.toLowerCase().indexOf('end');
                  
                  // Search for end time - look for the specific end date with time
                  if (endDateStr) {
                    // Try to find the end date with its time (e.g., "25 March, 2026 06:00 GMT+8")
                    const endDatePattern = endDateStr.replace(/(\w+)\s+(\d+),\s+(\d+)/, '$2\\s+$1,?\\s+$3');
                    const endDateRegex = new RegExp(endDatePattern + '\\s+(\\d{1,2}):(\\d{2})\\s+(GMT\\+8|UTC[+-]\\d+)', 'i');
                    const endDateMatch = allText.match(endDateRegex);
                    if (endDateMatch) {
                      const hour = parseInt(endDateMatch[1]);
                      const minute = parseInt(endDateMatch[2]);
                      const timezone = endDateMatch[3];
                      endTime = { hour, minute, timezone };
                    }
                  }
                  
                  // Fallback: Search for end time after "End" keyword
                  if (!endTime && endPos !== -1) {
                    const textAfterEnd = allText.substring(endPos);
                    const gmtEndMatch = textAfterEnd.match(/(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})\s+(\d{1,2}):(\d{2})\s+(GMT\+8|UTC[+-]\d+)/i);
                    if (gmtEndMatch) {
                      const hour = parseInt(gmtEndMatch[4]);
                      const minute = parseInt(gmtEndMatch[5]);
                      const timezone = gmtEndMatch[6];
                      endTime = { hour, minute, timezone };
                    }
                  }
                }
                
                if (!startTime) {
                  // Search for start time after "Start" keyword
                  const startPos = allText.toLowerCase().indexOf('start');
                  if (startPos !== -1) {
                    const textAfterStart = allText.substring(startPos);
                    const gmtStartMatch = textAfterStart.match(/(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})\s+(\d{1,2}):(\d{2})\s+(GMT\+8|UTC[+-]\d+)/i);
                    if (gmtStartMatch) {
                      const hour = parseInt(gmtStartMatch[4]);
                      const minute = parseInt(gmtStartMatch[5]);
                      const timezone = gmtStartMatch[6];
                      startTime = { hour, minute, timezone };
                    }
                  }
                }
                
                // Fallback: Look for patterns specifically near "End" text
                if (!endTime) {
                  // Split by lines and look for end time patterns
                  const lines = allText.split('\n');
                  for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    const lowerLine = line.toLowerCase();
                    
                    // Look for lines that contain "end" and a time
                    if (lowerLine.includes('end') && !lowerLine.includes('weekend')) {
                      // Try to extract time from this line or nearby lines
                      const timeMatch = line.match(/(\d{1,2}):(\d{2})/);
                      if (timeMatch) {
                        const hour = parseInt(timeMatch[1]);
                        const minute = parseInt(timeMatch[2]);
                        if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
                          endTime = { hour, minute };
                          break;
                        }
                      }
                      
                      // Also check the next line
                      if (i + 1 < lines.length) {
                        const nextLine = lines[i + 1];
                        const nextTimeMatch = nextLine.match(/(\d{1,2}):(\d{2})/);
                        if (nextTimeMatch) {
                          const hour = parseInt(nextTimeMatch[1]);
                          const minute = parseInt(nextTimeMatch[2]);
                          if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
                            endTime = { hour, minute };
                            break;
                          }
                        }
                      }
                    }
                  }
                }
                
                // If no specific time found, check if this is a "version end" event
                // These typically end at 11:59 or 12:00
                // Aptitude Showcase events always end at version end time (11:59)
                if (!endTime && (allText.toLowerCase().includes('version') || 
                                 allText.toLowerCase().includes('until version') ||
                                 allText.toLowerCase().includes('aptitude showcase'))) {
                  endTime = { hour: 11, minute: 59 };
                }
                
                return { description, pageTitle, endTime, startTime };
              });
              
              eventDescription = pageData.description;
              extractedEndTime = pageData.endTime;
              const extractedStartTime = pageData.startTime;
              const extractedPageTitle = pageData.pageTitle;
              
              // Use page title if available (more accurate, includes colons)
              if (extractedPageTitle && extractedPageTitle.length > 0) {
                // Remove "Event " prefix if present
                const cleanedTitle = extractedPageTitle.replace(/^Event\s+/i, '').trim();
                if (cleanedTitle.length > 0) {
                  wikiEvent.name = cleanedTitle;
                  console.log(`  ✓ Updated title from page: "${cleanedTitle}"`);
                }
              }
              
              if (eventDescription) {
                eventDescription = eventDescription.trim();
                console.log(`  ✓ Description found (${eventDescription.length} chars)`);
              } else {
                eventDescription = 'No details available for this event.';
                console.log(`  ✗ No description found, using fallback`);
              }
              
              if (extractedStartTime) {
                console.log(`  ⏰ Found start time: ${extractedStartTime.hour}:${extractedStartTime.minute.toString().padStart(2, '0')} ${extractedStartTime.timezone || 'UTC+8'}`);
              }
              
              if (extractedEndTime) {
                console.log(`  ⏰ Found end time: ${extractedEndTime.hour}:${extractedEndTime.minute.toString().padStart(2, '0')} ${extractedEndTime.timezone || 'UTC+8'}`);
              } else {
                console.log(`  ⚠️  No end time found, using default 03:59`);
              }
              
            } catch (descError) {
              console.log(`  ✗ Could not fetch description: ${descError.message}`);
              eventDescription = 'Event details coming soon.';
            }
          } else {
            eventDescription = 'Event details coming soon.';
          }
          
          // If we extracted a specific end time from the page, use it
          let eventTimezone = 'UTC+8'; // Default timezone
          if (extractedEndTime) {
            const localHour = extractedEndTime.hour;
            const localMinute = extractedEndTime.minute;
            const timezone = extractedEndTime.timezone || 'UTC+8';
            eventTimezone = timezone; // Save timezone for later
            
            // Store the time as-is (as shown on wiki)
            // Frontend will handle timezone conversion for countdown
            
            // Get the original date from the wiki
            const wikiDateMatch = wikiEvent.duration.match(/[–-]\s*([A-Za-z]+ \d{1,2}, \d{4})/);
            if (wikiDateMatch) {
              const [, endDateStr] = wikiDateMatch;
              const dateMatch = endDateStr.match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/);
              if (dateMatch) {
                const [, monthName, day, year] = dateMatch;
                const month = monthToIndex(monthName);
                
                // Convert UTC+8 time to UTC by subtracting 8 hours
                const utcHour = localHour - 8;
                const dayAdjust = utcHour < 0 ? -1 : 0;
                const finalDate = Date.UTC(
                  parseInt(year), 
                  month, 
                  parseInt(day) + dayAdjust, 
                  (utcHour + 24) % 24,
                  localMinute, 
                  0
                );
                
                actualEndDate = finalDate;
                console.log(`  ✓ Stored as: ${new Date(finalDate).toISOString()} (Wiki shows: ${localHour}:${localMinute.toString().padStart(2, '0')} ${timezone})`);
              }
            }
          }
          // Check if duration mentions "Version" - these events end at maintenance time (06:00 AM GMT+8)
          else if (wikiEvent.duration && wikiEvent.duration.toLowerCase().includes('version')) {
            console.log(`  ✓ Event duration mentions "Version" - using maintenance time (06:00 AM GMT+8)`);
            const endDateObj = new Date(endDate);
            endDateObj.setUTCHours(6, 0, 0, 0);
            actualEndDate = endDateObj.getTime();
            eventTimezone = 'UTC+8';
          }
          
          // Clean up event name: remove "Event" prefix only
          let cleanName = wikiEvent.name
            .replace(/^Event\s+/i, '')
            .trim();

          allEvents.push({
            name: cleanName,
            startDate: actualStartDate,
            endDate: actualEndDate,
            timezone: eventTimezone, // Store timezone for frontend
            isPermanent: isPermanent,
            imageUrl: wikiEvent.imageUrl,
            imageAlt: wikiEvent.imageAlt,
            type: wikiEvent.type,
            duration: wikiEvent.duration,
            eventUrl: wikiEvent.url,
            serverTimeInfo: serverTimeInfo,
            description: eventDescription,
            source: 'wiki'
          });
        }
      }
    }

    console.log(`Total processed events: ${allEvents.length}`);

    // Filter out events that last longer than 200 days (permanent events)
    const filteredEvents = allEvents.filter(event => {
      const duration = (event.endDate - event.startDate) / (1000 * 60 * 60 * 24);
      return duration <= 200;
    });

    console.log(`Events after filtering (≤200 days): ${filteredEvents.length}`);

    // Download images and process events
    const processedEvents = [];

    console.log(`\nStarting to process ${filteredEvents.length} events one at a time...`);
    
    for (let i = 0; i < filteredEvents.length; i++) {
      const event = filteredEvents[i];
      console.log(`\n[${i + 1}/${filteredEvents.length}] 🖼️  Processing: ${event.name}`);
      
      try {
        let localImagePath = '';

        if (event.imageUrl || event.imageAlt || event.eventUrl) {
          console.log(`  Processing image for: ${event.name}`);
          console.log(`  Event imageKey: ${event.imageKey || 'none'}`);
          
          // Add delay between each event to avoid being too aggressive (2 seconds)
          if (i > 0) {
            console.log(`  Waiting 2 seconds before processing...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          
          // Always try to resolve the full-resolution image from the event page
          let resolvedImageUrl = '';
          
          console.log(`  Current imageUrl from table: ${event.imageUrl ? event.imageUrl.substring(0, 80) + '...' : 'none'}`);
          console.log(`  Event URL: ${event.eventUrl ? event.eventUrl.substring(0, 80) + '...' : 'none'}`);
          console.log(`  Attempting to resolve full-resolution image from event page...`);
          
          // Try to get the thumbnail image from the event page
          if (event.eventUrl && event.eventUrl.includes('/wiki/')) {
            try {
              await page.goto(event.eventUrl, { 
                waitUntil: 'domcontentloaded', 
                timeout: 30000
              });
              
              // Wait for image to load
              await page.waitForSelector('img.pi-image-thumbnail', { timeout: 5000 }).catch(() => {
                console.log('  ⚠ Thumbnail not found');
              });
              
              const imageUrl = await page.evaluate(() => {
                const img = document.querySelector('img.pi-image-thumbnail');
                if (img && img.src) {
                  return img.src.split('/revision')[0];
                }
                return null;
              });
              
              if (imageUrl) {
                console.log(`  ✓ Found thumbnail image`);
                resolvedImageUrl = imageUrl;
              } else {
                console.log(`  ✗ No thumbnail image found`);
              }
            } catch (imgError) {
              console.log(`  ✗ Error fetching image: ${imgError.message}`);
            }
          }
          
          // If resolution failed, fall back to the table imageUrl
          if (!resolvedImageUrl && event.imageUrl && !event.imageUrl.startsWith('data:')) {
            console.log(`  Resolution failed, falling back to table imageUrl`);
            resolvedImageUrl = event.imageUrl;
          }
          
          // If we have a valid image URL, download it
          if (resolvedImageUrl && !resolvedImageUrl.startsWith('data:')) {
            // Include start date in filename to avoid overwriting recurring events with same name
            const startDate = new Date(event.startDate);
            const dateStr = `${startDate.getUTCFullYear()}-${String(startDate.getUTCMonth() + 1).padStart(2, '0')}-${String(startDate.getUTCDate()).padStart(2, '0')}`;
            
            const imageName = event.name.toLowerCase()
              .replace(/[^a-z0-9\s-]/g, '') // Remove special characters including apostrophes
              .replace(/\s+/g, '-')
              .substring(0, 40) + '-' + dateStr; // Add date to filename

            try {
              console.log(`  → Downloading from: ${resolvedImageUrl.substring(0, 120)}...`);
              localImagePath = await downloadImage(resolvedImageUrl, 'honkai-star-rail', imageName, 'events');
              
              // Ensure the path is properly formatted
              if (localImagePath && !localImagePath.startsWith('/images/')) {
                localImagePath = '/images/' + localImagePath.replace(/^\/+/, '');
              }
              
              console.log(`  ✓ Image downloaded: ${localImagePath}`);
            } catch (downloadError) {
              console.log(`  ✗ Could not download image: ${downloadError.message}`);
              localImagePath = ''; // Use empty string if download fails
            }
          } else {
            console.log(`  ✗ No valid image URL found, continuing without image`);
          }
        }

        processedEvents.push({
          name: event.name,
          startDate: event.startDate,
          endDate: event.endDate,
          timezone: event.timezone || 'UTC+8',
          imageUrl: localImagePath,
          imageAlt: event.imageAlt || '',
          type: event.type || 'In-Game',
          duration: event.duration || '',
          eventUrl: event.eventUrl || '',
          serverTimeInfo: event.serverTimeInfo || '',
          description: event.description || 'Event details coming soon.',
          source: event.source
        });

      } catch (error) {
        console.log(`Error processing event ${event.name}:`, error.message);

        processedEvents.push({
          name: event.name,
          startDate: event.startDate,
          endDate: event.endDate,
          timezone: event.timezone || 'UTC+8',
          imageUrl: '',
          imageAlt: event.imageAlt || '',
          type: event.type || 'In-Game',
          duration: event.duration || '',
          eventUrl: event.eventUrl || '',
          serverTimeInfo: event.serverTimeInfo || '',
          description: event.description || 'Event details coming soon.',
          source: event.source
        });
      }
    }

    return processedEvents;

  } catch (error) {
    console.error('Error scraping Star Rail events:', error);
    return [];
  } finally {
    await browser.close();
  }
}
// Function to fetch events from HSR Wiki API
async function fetchEventsFromWikiAPI() {
  try {
    console.log('Attempting to fetch events from HSR Wiki API...');

    // Try different API endpoints
    const apiUrls = [
      'https://honkai-star-rail.fandom.com/api.php?action=parse&page=Events&format=json&prop=text',
      'https://honkai-star-rail.fandom.com/api.php?action=query&titles=Events&prop=revisions&rvprop=content&format=json'
    ];

    for (const apiUrl of apiUrls) {
      try {
        const response = await fetch(apiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });

        if (response.ok) {
          const data = await response.json();
          console.log('API Response received, processing...');

          // Handle different API response formats
          let htmlContent = '';

          if (data.parse && data.parse.text) {
            htmlContent = data.parse.text['*'];
          } else if (data.query && data.query.pages) {
            const pages = Object.values(data.query.pages);
            if (pages[0] && pages[0].revisions && pages[0].revisions[0]) {
              htmlContent = pages[0].revisions[0]['*'];
            }
          }

          if (htmlContent) {
            return await parseWikiEventsFromHTML(htmlContent);
          }
        }
      } catch (error) {
        console.log(`API URL ${apiUrl} failed:`, error.message);
      }
    }

    console.log('All API attempts failed, will use Game8 as primary source');
    return [];

  } catch (error) {
    console.log('Wiki API completely failed:', error.message);
    return [];
  }
}

// Function to parse events from wiki HTML content
async function parseWikiEventsFromHTML(htmlContent) {
  try {
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM(htmlContent);
    const document = dom.window.document;

    const events = [];

    // Find the "Current" section
    const currentHeader = Array.from(document.querySelectorAll('h2')).find(h =>
      h.textContent.includes('Current')
    );

    if (currentHeader) {
      // Find the table after the Current header
      let nextElement = currentHeader.nextElementSibling;
      while (nextElement && nextElement.tagName !== 'TABLE') {
        nextElement = nextElement.nextElementSibling;
      }

      if (nextElement && nextElement.tagName === 'TABLE') {
        const rows = nextElement.querySelectorAll('tr');

        for (let i = 1; i < rows.length; i++) { // Skip header row
          const row = rows[i];
          const cells = row.querySelectorAll('td');

          if (cells.length >= 3) {
            const eventCell = cells[0];
            const durationCell = cells[1];
            const typeCell = cells[2];

            // Get event name and image
            const eventLink = eventCell.querySelector('a');
            const eventImage = eventCell.querySelector('img');

            if (eventLink && durationCell.textContent.trim()) {
              const eventName = eventLink.textContent.trim();
              const eventUrl = eventLink.href;
              const duration = durationCell.textContent.trim();
              const eventType = typeCell.textContent.trim();

              // Get image URL if available
              let imageUrl = '';
              if (eventImage) {
                imageUrl = eventImage.src || eventImage.getAttribute('data-src') || '';
                // Convert relative URLs to absolute
                if (imageUrl.startsWith('//')) {
                  imageUrl = 'https:' + imageUrl;
                } else if (imageUrl.startsWith('/')) {
                  imageUrl = 'https://honkai-star-rail.fandom.com' + imageUrl;
                }
              }

              events.push({
                name: eventName,
                duration: duration,
                type: eventType,
                url: eventUrl,
                imageUrl: imageUrl
              });
            }
          }
        }
      }
    }

    console.log(`Parsed ${events.length} events from wiki HTML`);
    return events;

  } catch (error) {
    console.log('Error parsing wiki HTML:', error.message);
    return [];
  }
}


// Helper function to parse wiki date format
function parseWikiDate(dateStr) {
  // Parse format: "February 09, 2026"
  const dateMatch = dateStr.match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/);

  if (dateMatch) {
    const [, monthName, day, year] = dateMatch;
    const month = monthToIndex(monthName);

    // Store as UTC: 03:59 UTC+8 = 19:59 UTC previous day
    const dateTime = Date.UTC(parseInt(year), month, parseInt(day) - 1, 19, 59, 0);

    console.log(`Parsed wiki date: ${dateStr} -> ${year}/${month + 1}/${day} 03:59 UTC+8 = UTC ${new Date(dateTime).toISOString()}`);
    return dateTime;
  }

  console.log(`Could not parse wiki date: ${dateStr}`);
  return null;
}


/**
 * Parse banner date from Game8 format and return timestamp
 * Star Rail banners start at 12:00 (noon) and end at 11:59 server time (UTC+8)
 * Start: 12:00 UTC+8 = 04:00 UTC
 * End: 11:59 UTC+8 = 03:59 UTC
 */
function parseBannerDate(dateText, isEndDate = false) {
  // Handle "End of X.X" format - use a far future date
  if (dateText.includes('End of')) {
    return Date.UTC(2027, 11, 31, 3, 59, 0);
  }
  
  // Match format: "Month Day, Year" or "Mon. Day, Year"
  const dateMatch = dateText.match(/([A-Za-z]+)\.?\s+(\d{1,2}),\s+(\d{4})/);
  
  if (dateMatch) {
    const [, monthName, day, year] = dateMatch;
    const month = monthToIndex(monthName);
    
    if (isEndDate) {
      console.log(`Parsed banner end date: ${monthName} ${day}, ${year} -> ${year}/${month + 1}/${day} 11:59 UTC+8`);
      // Banner ends at 11:59 server time (UTC+8) = 03:59 UTC
      return Date.UTC(parseInt(year), month, parseInt(day), 3, 59, 0);
    } else {
      console.log(`Parsed banner start date: ${monthName} ${day}, ${year} -> ${year}/${month + 1}/${day} 12:00 UTC+8`);
      // Banner starts at 12:00 noon server time (UTC+8) = 04:00 UTC
      return Date.UTC(parseInt(year), month, parseInt(day), 4, 0, 0);
    }
  }
  
  // Try to parse MM/DD format like "02/13"
  const shortDateMatch = dateText.match(/(\d{1,2})\/(\d{1,2})/);
  if (shortDateMatch) {
    const [, month, day] = shortDateMatch;
    if (isEndDate) {
      return Date.UTC(2026, parseInt(month) - 1, parseInt(day), 3, 59, 0);
    } else {
      return Date.UTC(2026, parseInt(month) - 1, parseInt(day), 4, 0, 0);
    }
  }
  
  console.log(`Could not parse banner date from: ${dateText}`);
  return Date.UTC(2026, 1, 1, isEndDate ? 3 : 4, isEndDate ? 59 : 0, 0);
}

/**
 * Parse event date from Game8 format and return timestamp
 * Star Rail events can end at different times depending on event type
 */
function parseEventDate(dateText, eventTitle = '') {
  // Handle "End of X.X" format - use a far future date
  if (dateText.includes('End of')) {
    return Date.UTC(2027, 11, 30, 20, 0, 0); // Dec 30 at 20:00 UTC = Dec 31 at 04:00 UTC+8
  }
  
  // Determine end time based on event type
  let endHourUTC = 20; // Default: 04:00 UTC+8 = 20:00 UTC previous day
  let matchedPattern = 'default (04:00 AM)';
  
  // Different event types have different end times
  if (eventTitle) {
    const title = eventTitle.toLowerCase();
    
    // Events that end at 06:00 AM server time (22:00 UTC previous day)
    if (title.includes('planar fissure') || 
        title.includes('realm of the strange') ||
        title.includes('double drop')) {
      endHourUTC = 22; // 06:00 UTC+8 = 22:00 UTC previous day
      matchedPattern = 'planar/realm (06:00 AM)';
    }
    
    // Events that end at 07:00 AM server time (23:00 UTC previous day)  
    else if (title.includes('cosmicon') ||
             title.includes('arcadia') ||
             title.includes('flip of fortune')) {
      endHourUTC = 23; // 07:00 UTC+8 = 23:00 UTC previous day
      matchedPattern = 'cosmicon/arcadia (07:00 AM)';
    }
    
    // Check if this is a completely unknown event type
    else if (!title.includes('login') && 
             !title.includes('check-in') && 
             !title.includes('gift') && 
             !title.includes('trial') && 
             !title.includes('skin') &&
             !title.includes('companion')) {
      console.log(`⚠️  UNKNOWN EVENT TYPE: "${eventTitle}" - Using default 04:00 AM end time. Please check if this event has a different end time!`);
    }
  }
  
  // Match format: "Month Day, Year" or "Mon. Day, Year"
  const dateMatch = dateText.match(/([A-Za-z]+)\.?\s+(\d{1,2}),\s+(\d{4})/);
  
  if (dateMatch) {
    const [, monthName, day, year] = dateMatch;
    const month = monthToIndex(monthName);
    
    const endTime = endHourUTC === 20 ? '04:00' : endHourUTC === 22 ? '06:00' : '07:00';
    console.log(`Parsed event date: ${monthName} ${day}, ${year} -> ${year}/${month + 1}/${day} ${endTime} UTC+8 (${matchedPattern})`);
    
    return Date.UTC(parseInt(year), month, parseInt(day) - 1, endHourUTC, 0, 0);
  }
  
  // Try to parse MM/DD format like "02/13"
  const shortDateMatch = dateText.match(/(\d{1,2})\/(\d{1,2})/);
  if (shortDateMatch) {
    const [, month, day] = shortDateMatch;
    return Date.UTC(2026, parseInt(month) - 1, parseInt(day) - 1, endHourUTC, 0, 0);
  }
  
  console.log(`Could not parse event date from: ${dateText}`);
  return Date.UTC(2026, 1, 0, 20, 0, 0); // Jan 31 at 20:00 UTC = Feb 1 at 04:00 UTC+8
}

/**
 * Convert month name to JavaScript month index (0-11)
 */
function monthToIndex(monthName) {
  const months = {
    'jan': 0, 'january': 0,
    'feb': 1, 'february': 1,
    'mar': 2, 'march': 2,
    'apr': 3, 'april': 3,
    'may': 4,
    'jun': 5, 'june': 5,
    'jul': 6, 'july': 6,
    'aug': 7, 'august': 7,
    'sep': 8, 'september': 8,
    'oct': 9, 'october': 9,
    'nov': 10, 'november': 10,
    'dec': 11, 'december': 11
  };
  
  return months[monthName.toLowerCase().replace('.', '')] || 0;
}

/**
 * Generate JavaScript code for events
 */
function generateEventsCode(events) {
  const eventsCode = events.map(event => {
    // Keep actual newlines in the description by using template literals
    const description = event.description.replace(/'/g, "\\'");
    return `  {
    title: '${event.title.replace(/'/g, "\\'")}',
    start: new Date('${event.start}'),
    end: new Date('${event.end}'),
    timezone: '${event.timezone || 'UTC+8'}',
    image: '${event.image.replace(/'/g, "\\'")}',
    description: \`${description.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`,
    game: '${event.game}',
  }`;
  }).join(',\n');

  return `// scrapedStarRailEvents.js
// Auto-generated by scrapeStarRailCurrentUpcoming.js
// Last updated: ${new Date().toISOString()}

export const scrapedStarRailEvents = [
${eventsCode}
];
`;
}

/**
 * Generate JavaScript code for Star Rail history events
 */
function generateStarRailHistoryFile(events) {
  const eventsCode = events.map(event => {
    const description = event.description ? event.description.replace(/`/g, '\\`').replace(/\$/g, '\\$') : '';
    
    // Handle permanent events with 'Indefinite' end dates
    // NEVER call new Date() on 'Indefinite' - keep it as a string
    let endCode;
    let isIndefinite = false;
    
    if (event.end === 'Indefinite' || 
        event.endNote === 'Permanent' ||
        (typeof event.end === 'string' && event.end.includes('Indefinite')) ||
        (event.end instanceof Date && isNaN(event.end.getTime()))) {
      // Write as string literal, not Date object
      endCode = "'Indefinite'";
      isIndefinite = true;
    } else {
      // Normal date - write as Date object
      endCode = `new Date('${event.end}')`;
    }
    
    // Auto-add endNote: 'Permanent' if end is Indefinite
    const endNoteCode = (isIndefinite || event.endNote === 'Permanent') ? `\n    endNote: 'Permanent',` : (event.endNote ? `\n    endNote: '${event.endNote}',` : '');
    
    return `  {
    title: '${event.title.replace(/'/g, "\\'")}',
    start: new Date('${event.start}'),
    end: ${endCode},${endNoteCode}
    image: '${event.image.replace(/'/g, "\\'")}',
    description: \`${description}\`,
    game: '${event.game}',
  }`;
  }).join(',\n');

  return `// scrapedStarRailHistoryEvents.js
// Auto-generated by scrapeStarRailCurrentUpcoming.js
// Last updated: ${new Date().toISOString()}

export const scrapedStarRailHistoryEvents = [
${eventsCode}
];
`;
}

/**
 * Generate JavaScript code for banners
 */
function generateBannersCode(banners) {
  const bannersCode = banners.map(banner => {
    // Keep actual newlines in the description by using template literals
    const description = banner.description ? banner.description.replace(/'/g, "\\'") : '';
    return `  {
    title: '${banner.title.replace(/'/g, "\\'")}',
    start: new Date('${banner.start}'),
    end: new Date('${banner.end}'),
    image: '${banner.image}',
    type: '${banner.type}',
    game: '${banner.game}',
    description: \`${description.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`,
  }`;
  }).join(',\n');

  return `// scrapedStarRailBanners.js
// Auto-generated by scrapeStarRailCurrentUpcoming.js
// Last updated: ${new Date().toISOString()}

export const scrapedStarRailBanners = [
${bannersCode}
];
`;
}

// Run the scraper
(async () => {
  try {
    console.log('\n⭐ Starting Honkai Star Rail scraper...\n');
    
    const events = await scrapeStarRailEvents();
    
    if (events.length === 0) {
      console.log('No events found. Exiting.');
      return;
    }
    
    console.log(`Processing ${events.length} events for file generation...`);
    
    // Convert events to the format expected by the calendar
    const formattedEvents = events.map(event => {
      // For recurring events, add the start date to the title to match history format
      let eventTitle = event.name;
      
      // Check if this is a Nameless Honor event (with or without "Event" prefix)
      const isNamelessHonor = eventTitle === 'Nameless Honor' || 
                              eventTitle === 'Event Nameless Honor' ||
                              eventTitle.startsWith('Nameless Honor ') ||
                              eventTitle.startsWith('Event Nameless Honor ');
      
      // Check if this is a Realm of the Strange event
      const isRealmOfStrange = eventTitle === 'Realm of the Strange' ||
                               eventTitle === 'Event Realm of the Strange' ||
                               eventTitle.startsWith('Realm of the Strange ') ||
                               eventTitle.startsWith('Event Realm of the Strange ');
      
      // Check if this is a Planar Fissure event
      const isPlanarFissure = eventTitle === 'Planar Fissure' ||
                              eventTitle === 'Event Planar Fissure' ||
                              eventTitle.startsWith('Planar Fissure ') ||
                              eventTitle.startsWith('Event Planar Fissure ');
      
      if (isNamelessHonor || isRealmOfStrange || isPlanarFissure) {
        // Get the start date in YYYY-MM-DD format
        const startDate = new Date(event.startDate);
        const dateStr = `${startDate.getUTCFullYear()}-${String(startDate.getUTCMonth() + 1).padStart(2, '0')}-${String(startDate.getUTCDate()).padStart(2, '0')}`;
        
        // Only add date if it's not already in the title
        if (!eventTitle.includes(dateStr)) {
          if (isNamelessHonor) {
            eventTitle = `Nameless Honor ${dateStr}`;
          } else if (isRealmOfStrange) {
            eventTitle = `Realm of the Strange ${dateStr}`;
          } else if (isPlanarFissure) {
            eventTitle = `Planar Fissure ${dateStr}`;
          }
        }
      }
      
      return {
        title: eventTitle, // Use the title exactly as provided by the wiki (with date suffix for recurring events)
        start: new Date(event.startDate).toISOString(),
        end: event.isPermanent ? 'Indefinite' : new Date(event.endDate).toISOString(),
        timezone: event.timezone || 'UTC+8',
        ...(event.isPermanent && { endNote: 'Permanent' }),
        image: event.imageUrl,
        description: event.description || '',
        game: 'Honkai: Star Rail'
      };
    });
    
    // Generate JavaScript code
    const jsCode = generateEventsCode(formattedEvents);
    
    // Write the events file
    const outputPath = path.join(__dirname, '..', 'src', 'data', 'scrapedStarRailEvents.js');

    // Load existing images before overwriting so we can preserve them if scrape missed any
    const existingImageMap = await loadExistingImages(outputPath, 'scrapedStarRailEvents');
    const formattedEventsWithImages = formattedEvents.map(event => ({
      ...event,
      image: resolveImage(event.image, event.title, existingImageMap),
    }));

    fs.writeFileSync(outputPath, generateEventsCode(formattedEventsWithImages));
    
    console.log(`\n✅ Events saved to: ${outputPath}`);
    console.log(`📊 Total events: ${formattedEvents.length}`);
    
    // Write JSON backup
    const jsonPath = path.join(__dirname, '..', 'src', 'data', 'scrapedStarRailEvents.json');
    fs.writeFileSync(jsonPath, JSON.stringify(formattedEventsWithImages, null, 2));
    console.log(`💾 JSON backup saved to: ${jsonPath}`);
    
    // Also write to history file (merge with existing)
    const historyOutputPath = path.join(__dirname, '..', 'src', 'data', 'scrapedStarRailHistoryEvents.js');
    let existingHistoryEvents = [];
    
    // Try to read existing history file
    try {
      const { scrapedStarRailHistoryEvents } = await import(`file://${historyOutputPath}?t=${Date.now()}`);
      existingHistoryEvents = scrapedStarRailHistoryEvents || [];
      console.log(`📚 Found ${existingHistoryEvents.length} existing history events`);
    } catch (error) {
      console.log(`📚 No existing history file found, creating new one`);
    }
    
    // Create map of existing events
    const eventsMap = new Map();
    existingHistoryEvents.forEach(event => {
      const key = `${event.title}|||${new Date(event.start).toISOString()}`;
      eventsMap.set(key, event);
    });
    
    // Add/update with new events
    formattedEvents.forEach(event => {
      const key = `${event.title}|||${event.start}`;
      eventsMap.set(key, event);
    });
    
    // Remove duplicate events where one is a substring of another with same start date
    // Keep only the longer, more specific title
    const allEvents = Array.from(eventsMap.values());
    const keysToRemove = new Set();
    
    for (let i = 0; i < allEvents.length; i++) {
      for (let j = i + 1; j < allEvents.length; j++) {
        const event1 = allEvents[i];
        const event2 = allEvents[j];
        
        // Check if they have the same start date
        if (new Date(event1.start).getTime() === new Date(event2.start).getTime()) {
          const title1 = event1.title;
          const title2 = event2.title;
          
          // Check if one title is a prefix of the other (before a colon)
          const baseTitle1 = title1.split(':')[0].trim();
          const baseTitle2 = title2.split(':')[0].trim();
          
          if (baseTitle1 === baseTitle2) {
            // Keep the longer title (more specific)
            const keyToRemove = title1.length < title2.length 
              ? `${title1}|||${new Date(event1.start).toISOString()}`
              : `${title2}|||${new Date(event2.start).toISOString()}`;
            keysToRemove.add(keyToRemove);
            console.log(`  Removing duplicate: "${title1.length < title2.length ? title1 : title2}" (keeping longer version)`);
          }
        }
      }
    }
    
    // Remove the shorter duplicates
    keysToRemove.forEach(key => eventsMap.delete(key));
    
    // Convert to array and sort by start date (newest first)
    const mergedEvents = Array.from(eventsMap.values())
      .sort((a, b) => new Date(b.start) - new Date(a.start));
    
    const historyJsCode = generateStarRailHistoryFile(mergedEvents);
    fs.writeFileSync(historyOutputPath, historyJsCode);
    
    console.log(`✅ Events also saved to: ${historyOutputPath}`);
    console.log(`📊 Total history events: ${mergedEvents.length} (${mergedEvents.length - existingHistoryEvents.length} new)\n`);
    
    // Save JSON backup
    const jsonBackup = mergedEvents.map(event => {
      let endValue;
      // Check if end is already 'Indefinite' string or if event is marked as Permanent
      if (event.end === 'Indefinite' || event.endNote === 'Permanent') {
        endValue = 'Indefinite';
      } else {
        try {
          const endDate = new Date(event.end);
          if (isNaN(endDate.getTime())) {
            console.error(`Invalid end date for event "${event.title}": ${event.end}`);
            endValue = 'Indefinite'; // Default to Indefinite if invalid
          } else {
            endValue = endDate.toISOString();
          }
        } catch (e) {
          console.error(`Error converting end date for event "${event.title}": ${event.end}`);
          endValue = 'Indefinite'; // Default to Indefinite if conversion fails
        }
      }
      
      // Auto-add endNote: 'Permanent' if end is 'Indefinite'
      const endNote = (endValue === 'Indefinite' || event.endNote === 'Permanent') ? 'Permanent' : event.endNote;
      
      return {
        title: event.title,
        start: new Date(event.start).toISOString(),
        end: endValue,
        endNote: endNote,
        image: event.image || '',
        description: event.description || '',
        game: 'Honkai: Star Rail',
        wikiUrl: event.wikiUrl || ''
      };
    });
    const historyJsonPath = path.join(__dirname, '..', 'src', 'data', 'scrapedStarRailHistoryEvents.json');
    fs.writeFileSync(historyJsonPath, JSON.stringify(jsonBackup, null, 2));
    console.log(`💾 JSON backup saved to: ${historyJsonPath}\n`);
    
    // Log some sample events
    console.log('\n📅 Sample events:');
    formattedEvents.slice(0, 3).forEach(event => {
      console.log(`  - ${event.title} (${event.start} to ${event.end})`);
    });
    
  } catch (error) {
    console.error('❌ Scraper failed:', error);
    process.exit(1);
  }
})();
