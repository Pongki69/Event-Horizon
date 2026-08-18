// scrapeStarRailHistory.js
// Script to scrape Honkai Star Rail historical events from wiki
// Run with: node scripts/scrapeStarRailHistory.js

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { downloadImage } from './archiveUtils.js';
import { loginToFandom } from './fandomLogin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Starting Honkai Star Rail Historical Events scraper from Wiki...');
console.log('MODE: Scraping all events\n');

/**
 * Wait for Cloudflare Turnstile challenge to complete
 */
async function waitForCloudflareChallenge(page, timeout = 30000) {
  try {
    console.log(`  Waiting for Cloudflare challenge to complete...`);
    
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
    
    console.log(`  ✓ Cloudflare challenge passed`);
    return true;
  } catch (error) {
    console.log(`  ✗ Cloudflare challenge timeout or failed: ${error.message}`);
    return false;
  }
}

// Load existing data to check which events already have images
const existingDataPath = path.join(__dirname, '..', 'src', 'data', 'scrapedStarRailHistoryEvents.js');
let existingEvents = [];
try {
  const { scrapedStarRailHistoryEvents } = await import(`file://${existingDataPath}?t=${Date.now()}`);
  existingEvents = scrapedStarRailHistoryEvents || [];
  console.log(`Loaded ${existingEvents.length} existing events\n`);
} catch (e) {
  console.log('No existing data found, will scrape all events\n');
}

async function scrapeHistoryPage() {
  const url = 'https://honkai-star-rail.fandom.com/wiki/Events/History';
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Scraping: ${url}`);
  console.log('='.repeat(80));
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    await loginToFandom(page);

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Wait for Cloudflare challenge
    await waitForCloudflareChallenge(page, 45000);

    // Wait for tables to load
    await page.waitForSelector('table', { timeout: 10000 }).catch(() => {
      console.log('⚠ Tables not found');
    });

    // Extract events from tables
    const events = await page.evaluate(() => {
      const eventData = [];
      const tables = document.querySelectorAll('table');
      
      console.log(`Found ${tables.length} table elements`);
      
      for (const table of tables) {
        const rows = table.querySelectorAll('tbody tr');
        
        for (const row of rows) {
          const cells = row.querySelectorAll('td');
          
          // Should have 4 columns: image, name, start, end
          if (cells.length < 4) continue;
          
          // Column 1: Name (has <a> with href)
          const nameCell = cells[1];
          const link = nameCell.querySelector('a');
          
          if (!link) continue;
          
          const title = link.textContent.trim();
          const href = link.getAttribute('href') || '';
          
          console.log(`Found event: "${title}"`);
          
          if (title && href) {
            eventData.push({
              title: title,
              href: href.startsWith('http') ? href : `https://honkai-star-rail.fandom.com${href}`
            });
          }
        }
      }
      
      return eventData;
    });

    console.log(`Found ${events.length} events`);
    
    // Deduplicate events based on title and URL
    const seenEvents = new Map();
    const uniqueEvents = [];
    
    for (const event of events) {
      const eventKey = `${event.title}::${event.href}`;
      
      if (seenEvents.has(eventKey)) {
        console.log(`⚠️  Duplicate detected: "${event.title}" - skipping`);
        continue;
      }
      
      seenEvents.set(eventKey, event);
      uniqueEvents.push(event);
    }
    
    console.log(`After deduplication: ${uniqueEvents.length} unique events`);
    events = uniqueEvents;
    
    await browser.close();

    // Process all events
    const eventsToProcess = events;

    console.log(`\n📊 Processing all ${eventsToProcess.length} events\n`);
    
    // Process each event
    const processedEvents = [];
    
    for (let i = 0; i < eventsToProcess.length; i++) {
      const event = eventsToProcess[i];
      console.log(`\n[${i + 1}/${eventsToProcess.length}] Processing: ${event.title}`);
      
      try {
        const eventBrowser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const eventPage = await eventBrowser.newPage();
        await eventPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        
        console.log(`  Navigating to: ${event.href}`);
        
        await eventPage.goto(event.href, {
          waitUntil: 'domcontentloaded',
          timeout: 60000
        });
        
        // Wait for Cloudflare challenge
        await waitForCloudflareChallenge(eventPage, 45000);
        
        // Wait for content to load
        await eventPage.waitForSelector('.infoboxtable, .portable-infobox', { timeout: 5000 }).catch(() => {
          console.log('  ⚠ Infobox not found');
        });
        
        // Extract event details
        const eventDetails = await eventPage.evaluate(() => {
          let startDate = '';
          let endDate = '';
          let description = '';
          let imageName = '';
          let startTime = null;
          let endTime = null;
          
          // Find dates in <td class="pi-horizontal-group-item pi-data-value pi-font pi-border-color pi-item-spacing">
          const dateCells = document.querySelectorAll('td.pi-horizontal-group-item.pi-data-value.pi-font.pi-border-color.pi-item-spacing');
          
          if (dateCells.length >= 2) {
            startDate = dateCells[0].textContent.trim();
            endDate = dateCells[1].textContent.trim();
            
            // Remove "Start" and "End" prefixes
            startDate = startDate.replace(/^Start/i, '').trim();
            endDate = endDate.replace(/^End/i, '').trim();
            
            console.log(`Found dates - Start: "${startDate}", End: "${endDate}"`);
          }
          
          // Extract times from the date strings if they contain GMT+8
          // Format: "13 February, 2026 10:00 GMT+8"
          const startTimeMatch = startDate.match(/(\d{1,2}):(\d{2})\s+GMT\+8/i);
          if (startTimeMatch) {
            startTime = { hour: parseInt(startTimeMatch[1]), minute: parseInt(startTimeMatch[2]) };
            console.log(`Found start time: ${startTime.hour}:${startTime.minute.toString().padStart(2, '0')}`);
          }
          
          const endTimeMatch = endDate.match(/(\d{1,2}):(\d{2})\s+GMT\+8/i);
          if (endTimeMatch) {
            endTime = { hour: parseInt(endTimeMatch[1]), minute: parseInt(endTimeMatch[2]) };
            console.log(`Found end time: ${endTime.hour}:${endTime.minute.toString().padStart(2, '0')}`);
          }
          
          // Get image name from infobox
          const infoboxImg = document.querySelector('.infoboxtable img[data-image-key], .portable-infobox img[data-image-key]');
          if (infoboxImg) {
            imageName = infoboxImg.getAttribute('data-image-key') || '';
            console.log(`Found image key: "${imageName}"`);
          }
          
          // Find description (same as current/upcoming scraper)
          const descElement = document.querySelector('.srw-description-content');
          if (descElement) {
            description = descElement.innerText || descElement.textContent || '';
          }
          
          // Fallback: If no description found, try to get the first <p> after <div class="countdownevent hidden">
          if (!description) {
            const countdownDiv = document.querySelector('.countdownevent.hidden');
            if (countdownDiv) {
              let nextElement = countdownDiv.nextElementSibling;
              while (nextElement) {
                if (nextElement.tagName === 'P') {
                  description = nextElement.innerText || nextElement.textContent || '';
                  break;
                }
                const pInside = nextElement.querySelector('p');
                if (pInside) {
                  description = pInside.innerText || pInside.textContent || '';
                  break;
                }
                nextElement = nextElement.nextElementSibling;
              }
            }
          }
          
          // Final fallback
          if (!description) {
            const firstP = document.querySelector('.mw-parser-output > p');
            if (firstP) {
              description = firstP.innerText || firstP.textContent || '';
            }
          }
          
          return { startDate, endDate, description, imageName, startTime, endTime };
        });
        
        console.log(`  Start: "${eventDetails.startDate}"`);
        console.log(`  End: "${eventDetails.endDate}"`);
        console.log(`  Image: "${eventDetails.imageName}"`);
        if (eventDetails.startTime) {
          console.log(`  Start Time: ${eventDetails.startTime.hour}:${eventDetails.startTime.minute.toString().padStart(2, '0')} GMT+8`);
        }
        if (eventDetails.endTime) {
          console.log(`  End Time: ${eventDetails.endTime.hour}:${eventDetails.endTime.minute.toString().padStart(2, '0')} GMT+8`);
        }
        console.log(`  Description: ${eventDetails.description ? eventDetails.description.substring(0, 100) + '...' : '(empty)'}`);
        
        if (!eventDetails.startDate || !eventDetails.endDate) {
          console.log(`  ✗ Skipping: missing date information`);
          await eventBrowser.close();
          continue;
        }
        
        // Get thumbnail image (like Genshin History scraper)
        let localImage = '';
        if (eventDetails.imageName) {
          try {
            console.log(`  Looking for thumbnail image...`);
            
            // Wait 1.5 seconds for page to load (like Genshin History)
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            const imageUrl = await eventPage.evaluate(() => {
              const img = document.querySelector('img.pi-image-thumbnail');
              return img && img.src ? img.src.split('/revision')[0] : null;
            });
            
            if (imageUrl) {
              console.log(`  ✓ Found thumbnail`);
              
              localImage = await downloadImage(
                imageUrl,
                'honkai-star-rail',
                event.title,
                'events',
                eventDetails.imageName
              );
              
              if (localImage) {
                console.log(`  ✓ Image saved: ${localImage}`);
              }
            } else {
              console.log(`  ✗ No thumbnail found`);
            }
          } catch (imgError) {
            console.log(`  ✗ Error: ${imgError.message}`);
          }
        }
        
        await eventBrowser.close();
        
        // Parse dates with extracted times
        let parsedStartDate = null;
        let parsedEndDate = null;
        
        // Parse start date
        const startMatch = eventDetails.startDate.match(/(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})/);
        if (startMatch) {
          const [, day, monthName, year] = startMatch;
          const monthIndex = monthToIndex(monthName);
          
          // Use extracted time or default to 10:00 (server reset time)
          const startHour = eventDetails.startTime ? eventDetails.startTime.hour : 10;
          const startMinute = eventDetails.startTime ? eventDetails.startTime.minute : 0;
          
          // Convert to UTC: subtract 8 hours from GMT+8
          parsedStartDate = Date.UTC(parseInt(year), monthIndex, parseInt(day), startHour, startMinute, 0) - (8 * 60 * 60 * 1000);
          console.log(`  Parsed start: ${monthName} ${day}, ${year} ${startHour}:${startMinute.toString().padStart(2, '0')} GMT+8`);
        }
        
        // Parse end date
        let isPermanent = false;
        const endMatch = eventDetails.endDate.match(/(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})/);
        
        if (endMatch) {
          const [, day, monthName, year] = endMatch;
          const monthIndex = monthToIndex(monthName);
          
          // Use extracted time or default to 03:59 (before reset)
          const endHour = eventDetails.endTime ? eventDetails.endTime.hour : 3;
          const endMinute = eventDetails.endTime ? eventDetails.endTime.minute : 59;
          
          // Convert to UTC: subtract 8 hours from GMT+8
          parsedEndDate = Date.UTC(parseInt(year), monthIndex, parseInt(day), endHour, endMinute, 0) - (8 * 60 * 60 * 1000);
          console.log(`  Parsed end: ${monthName} ${day}, ${year} ${endHour}:${endMinute.toString().padStart(2, '0')} GMT+8`);
        } else if (eventDetails.endDate.toLowerCase().includes('indefinite')) {
          // Handle indefinite/permanent events
          isPermanent = true;
          if (parsedStartDate) {
            parsedEndDate = parsedStartDate + (30 * 24 * 60 * 60 * 1000); // 30 days for calendar display
            console.log(`  Parsed end: Indefinite (showing 30 days on calendar)`);
          }
        }
        
        if (!parsedStartDate || !parsedEndDate) {
          console.log(`  ✗ Skipping: could not parse dates`);
          continue;
        }
        
        const eventObj = {
          title: event.title,
          start: new Date(parsedStartDate),
          end: new Date(parsedEndDate),
          image: localImage || '',
          description: eventDetails.description || 'Historical event.',
          game: 'Honkai: Star Rail',
          wikiUrl: event.href
        };
        
        // Add endNote for permanent events
        if (isPermanent) {
          eventObj.endNote = 'Permanent';
        }
        
        processedEvents.push(eventObj);
        
        console.log(`  ✓ Processed successfully`);
        
      } catch (error) {
        console.log(`  ✗ Error: ${error.message}`);
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

// Helper function to convert month name to index
function monthToIndex(monthName) {
  const months = {
    'jan': 0, 'january': 0, 'feb': 1, 'february': 1,
    'mar': 2, 'march': 2, 'apr': 3, 'april': 3,
    'may': 4, 'jun': 5, 'june': 5,
    'jul': 6, 'july': 6, 'aug': 7, 'august': 7,
    'sep': 8, 'september': 8, 'oct': 9, 'october': 9,
    'nov': 10, 'november': 10, 'dec': 11, 'december': 11
  };
  return months[monthName.toLowerCase().substring(0, 3)];
}

    return processedEvents;
    
  } catch (error) {
    console.error(`Error scraping history:`, error);
    await browser.close();
    return [];
  }
}

async function scrapeAll() {
  const newEvents = await scrapeHistoryPage();

  console.log(`\n${'='.repeat(80)}`);
  console.log(`SCRAPED: ${newEvents.length} events`);
  console.log('='.repeat(80));

  // Merge with existing events - update only the ones we just scraped
  const mergedEvents = existingEvents.map(existing => {
    const updated = newEvents.find(e => e.title === existing.title);
    if (updated) {
      console.log(`✓ Updated: ${existing.title}`);
      return {
        ...existing,
        image: updated.image, // Update image
        start: updated.start,
        end: updated.end,
        description: updated.description || existing.description,
        endNote: updated.endNote || existing.endNote
      };
    }
    return existing;
  });
  
  // Add new events that don't exist yet
  for (const newEvent of newEvents) {
    const exists = mergedEvents.find(e => e.title === newEvent.title);
    if (!exists) {
      console.log(`✓ Added new: ${newEvent.title}`);
      mergedEvents.push(newEvent);
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`TOTAL: ${mergedEvents.length} events in final output`);
  console.log('='.repeat(80));

  // Generate JavaScript code (keep original format with Date objects)
  const eventsCode = mergedEvents.map(event => {
    const startDate = typeof event.start === 'string' ? event.start : event.start.toISOString();
    
    // For permanent events, use 'Indefinite' string instead of Date
    let endDateCode;
    if (event.endNote === 'Permanent') {
      endDateCode = "'Indefinite'";
    } else {
      const endDate = typeof event.end === 'string' ? event.end : event.end.toISOString();
      endDateCode = `new Date('${endDate}')`;
    }
    
    return `  {
    title: '${event.title.replace(/'/g, "\\'")}',
    start: new Date('${startDate}'),
    end: ${endDateCode},${event.endNote ? `\n    endNote: '${event.endNote}',` : ''}
    image: '${event.image}',
    description: \`${event.description.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`,
    game: '${event.game}',
    wikiUrl: '${event.wikiUrl}',
  }`;`').replace(/\$/g, '\\$')}\`,
    game: '${event.game}',
    wikiUrl: '${event.wikiUrl}',
  }`;
  }).join(',\n');

  const jsCode = `// scrapedStarRailHistoryEvents.js
// Auto-generated by scrapeStarRailHistory.js from Honkai Star Rail Wiki
// Last updated: ${new Date().toISOString()}

export const scrapedStarRailHistoryEvents = [
${eventsCode}
];
`;

  // Write to JS file
  const outputPath = path.join(__dirname, '..', 'src', 'data', 'scrapedStarRailHistoryEvents.js');
  fs.writeFileSync(outputPath, jsCode);

  console.log(`\n✅ Historical events saved to: ${outputPath}`);
  console.log(`📊 Total events: ${mergedEvents.length}`);
  console.log(`📸 Updated ${newEvents.length} events with new images`);

  // Write JSON backup
  const jsonBackup = mergedEvents.map(event => ({
    ...event,
    start: typeof event.start === 'string' ? event.start : event.start.toISOString(),
    end: typeof event.end === 'string' ? event.end : event.end.toISOString()
  }));
  const jsonPath = path.join(__dirname, '..', 'src', 'data', 'scrapedStarRailHistoryEvents.json');
  fs.writeFileSync(jsonPath, JSON.stringify(jsonBackup, null, 2));
  console.log(`💾 JSON backup saved to: ${jsonPath}`);
}

scrapeAll();
