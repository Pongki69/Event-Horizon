// scrapeZZZHistory.js
// Script to scrape Zenless Zone Zero historical events
// Run with: node scripts/scrapeZZZHistory.js

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { downloadImage } from './archiveUtils.js';
import { loginToFandom } from './fandomLogin.js';

// Use stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Checkpoint file to track progress
const CHECKPOINT_FILE = path.join(__dirname, '.zzz-history-checkpoint.json');

/**
 * Load checkpoint data
 */
function loadCheckpoint() {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      const data = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
      console.log(`📌 Resuming from checkpoint: ${data.lastProcessedIndex + 1}/${data.totalEvents} events\n`);
      return data;
    }
  } catch (error) {
    console.log(`⚠️  Could not load checkpoint: ${error.message}`);
  }
  return null;
}

/**
 * Save checkpoint data
 */
function saveCheckpoint(index, totalEvents, processedEvents) {
  try {
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify({
      lastProcessedIndex: index,
      totalEvents: totalEvents,
      processedEvents: processedEvents,
      timestamp: new Date().toISOString()
    }, null, 2));
  } catch (error) {
    console.log(`⚠️  Could not save checkpoint: ${error.message}`);
  }
}

/**
 * Clear checkpoint file
 */
function clearCheckpoint() {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      fs.unlinkSync(CHECKPOINT_FILE);
      console.log(`✓ Checkpoint cleared\n`);
    }
  } catch (error) {
    console.log(`⚠️  Could not clear checkpoint: ${error.message}`);
  }
}

/**
 * Wait for Cloudflare Turnstile challenge to complete
 */
async function waitForCloudflareChallenge(page, timeout = 30000) {
  try {
    console.log(`    ⏳ Waiting for Cloudflare challenge to complete...`);
    
    await page.waitForFunction(
      () => {
        const challengeText = document.body.textContent || '';
        const isChallengePage = challengeText.includes('Performing security verification') || 
                               challengeText.includes('Verifying you are human') ||
                               challengeText.includes('Cloudflare');
        
        if (!isChallengePage) {
          return true;
        }
        
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

console.log('\n🚀 Starting Zenless Zone Zero history scraper...\n');

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
  return months[monthName.toLowerCase().substring(0, 3)];
}

/**
 * Parse wiki date format and return UTC timestamp
 * Default time: 03:59 AM UTC+8
 */
function parseWikiDate(dateStr) {
  const dateMatch = dateStr.match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/);

  if (dateMatch) {
    const [, monthName, day, year] = dateMatch;
    const month = monthToIndex(monthName);

    const dateTime = Date.UTC(parseInt(year), month, parseInt(day), 3, 59, 0);

    console.log(`    Parsed: ${dateStr} -> ${year}/${month + 1}/${day} 03:59 UTC+8`);
    return dateTime;
  }

  console.log(`    Could not parse date: ${dateStr}`);
  return null;
}

async function scrapeZZZHistory() {
  console.log('🎮 Starting Zenless Zone Zero history scraping...\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process'
    ],
    protocolTimeout: 600000 // 10 minutes timeout (increased from 3 minutes)
  });

  try {
    const page = await browser.newPage();
    
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    await loginToFandom(page);

    console.log('📡 Fetching historical events from ZZZ Wiki...');
    
    await page.goto('https://zenless-zone-zero.fandom.com/wiki/Event/History', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    console.log('✅ Page loaded, waiting for content...\n');

    // Wait for Cloudflare challenge to pass and tables to render
    try {
      await page.waitForFunction(
        () => {
          const body = document.body.textContent || '';
          const isChallenge = body.includes('Performing security verification') ||
                              body.includes('Verifying you are human') ||
                              body.includes('Just a moment');
          if (isChallenge) return false;
          return document.querySelectorAll('table').length > 0;
        },
        { timeout: 45000, polling: 1000 }
      );
      console.log('✅ Page content ready!\n');
    } catch (e) {
      console.log(`⚠️  Timeout waiting for tables: ${e.message}`);
    }
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Count and extract events from ALL history tables
    // The page uses "Events by Version" / "Events by Type" h2 headings
    // with tables that have headers: Image, Name, Start, End, Version
    const eventCount = await page.evaluate(() => {
      let totalCount = 0;
      const tables = document.querySelectorAll('table');
      for (const table of tables) {
        const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent.trim().toLowerCase());
        if (headers.includes('name') && headers.includes('start') && headers.includes('end')) {
          const rows = table.querySelectorAll('tr');
          totalCount += rows.length - 1; // Subtract header row
        }
      }
      return totalCount;
    });

    console.log(`📊 Total events found in all tables: ${eventCount}\n`);

    // Extract events from ALL history tables (match by column headers)
    const events = await page.evaluate(() => {
      const eventData = [];
      const seen = new Set();

      const tables = document.querySelectorAll('table');
      for (const table of tables) {
        const headerRow = table.querySelector('tr');
        if (!headerRow) continue;
        const headers = Array.from(headerRow.querySelectorAll('th')).map(th => th.textContent.trim().toLowerCase());

        // Only process tables with Name, Start, End columns
        const nameIdx = headers.indexOf('name');
        const startIdx = headers.indexOf('start');
        const endIdx = headers.indexOf('end');
        const imageIdx = headers.indexOf('image');

        if (nameIdx === -1 || startIdx === -1 || endIdx === -1) continue;

        const rows = table.querySelectorAll('tr');
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const cells = row.querySelectorAll('td');

          if (cells.length < Math.max(nameIdx, startIdx, endIdx) + 1) continue;

          const imageCell = imageIdx >= 0 ? cells[imageIdx] : null;
          const img = imageCell ? imageCell.querySelector('img') : null;
          const imageUrl = img ? (img.getAttribute('data-src') || img.getAttribute('src') || '') : '';

          const nameCell = cells[nameIdx];
          const nameLink = nameCell.querySelector('a');
          if (!nameLink) continue;

          const eventName = nameLink.textContent.trim();
          let eventUrl = nameLink.getAttribute('href') || '';
          if (eventUrl && eventUrl.startsWith('/wiki/')) {
            eventUrl = 'https://zenless-zone-zero.fandom.com' + eventUrl;
          }

          const startDateText = cells[startIdx].textContent.trim();
          const endDateText = cells[endIdx].textContent.trim();

          if (!startDateText || !endDateText) continue;

          // Deduplicate by name + startDate
          const key = `${eventName}::${startDateText}`;
          if (seen.has(key)) continue;
          seen.add(key);

          eventData.push({
            name: eventName,
            startDate: startDateText,
            endDate: endDateText,
            imageUrl: imageUrl,
            eventUrl: eventUrl
          });
        }
      }

      return eventData;
    });

    console.log(`📋 Found ${events.length} historical events\n`);

    // Load checkpoint if exists
    const checkpoint = loadCheckpoint();
    let startIndex = 0;
    let allEvents = [];
    
    if (checkpoint && checkpoint.totalEvents === events.length) {
      startIndex = checkpoint.lastProcessedIndex + 1;
      allEvents = checkpoint.processedEvents || [];
      console.log(`📌 Resuming from event ${startIndex + 1}/${events.length}\n`);
    } else {
      console.log(`🆕 Starting fresh scrape\n`);
    }

    for (let i = startIndex; i < events.length; i++) {
      const event = events[i];
      console.log(`\n[${i + 1}/${events.length}] 📄 Processing: ${event.name}`);
      
      const startDate = parseWikiDate(event.startDate);
      const endDate = parseWikiDate(event.endDate);
      
      // Check if end date is "Indefinite" or similar
      let isIndefinite = false;
      let actualEndDate = endDate;
      
      if (!endDate || event.endDate.toLowerCase().includes('indefinite') || event.endDate.toLowerCase().includes('tba')) {
        isIndefinite = true;
        actualEndDate = 'Indefinite';
        console.log(`  ℹ️ Event is Permanent/Indefinite`);
      }
      
      if (!startDate) {
        console.log(`  ✗ Skipping: invalid start date`);
        continue;
      }
      
      if (!isIndefinite && !actualEndDate) {
        console.log(`  ✗ Skipping: invalid end date`);
        continue;
      }
      
      let actualStartDate = startDate;
      let eventDescription = '';
      let extractedEndTime = null;
      let extractedStartTime = null;
      let eventName = event.name;
      
      // Fetch event details from the event page
      if (event.eventUrl && !event.eventUrl.includes('/File:') && !event.eventUrl.includes('/Special:')) {
        try {
          console.log(`  🔗 Fetching from: ${event.eventUrl.substring(0, 80)}...`);
          
          await page.goto(event.eventUrl, { 
            waitUntil: 'domcontentloaded', 
            timeout: 30000 
          });
          
          const challengePassed = await waitForCloudflareChallenge(page, 45000);
          
          if (!challengePassed) {
            console.log(`  ✗ Could not pass Cloudflare challenge`);
            eventDescription = 'Event details coming soon.';
          } else {
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            await page.waitForSelector('.mw-parser-output, p', { timeout: 5000 }).catch(() => {
              console.log('  ⚠️  Content not found');
            });
          
            const pageData = await page.evaluate(() => {
              // Get page title
              let pageTitle = '';
              const nameElement = document.querySelector('[data-source="name"]');
              if (nameElement) {
                pageTitle = nameElement.textContent.trim();
              } else {
                const h1Element = document.querySelector('h1.page-header__title');
                if (h1Element) {
                  pageTitle = h1Element.textContent.trim();
                } else {
                  pageTitle = document.title.split('|')[0].trim();
                }
              }
              
              let description = '';
              
              // Priority 1: Check for .description.standard-border div
              const descriptionDiv = document.querySelector('div.description.standard-border');
              if (descriptionDiv) {
                description = (descriptionDiv.innerText || descriptionDiv.textContent || '').trim();
              }
              
              // Priority 2: Find <h3> with <span id="Summary">
              if (!description) {
                const summaryH3 = Array.from(document.querySelectorAll('h3')).find(h3 => {
                  const span = h3.querySelector('span#Summary, span.mw-headline#Summary');
                  return span !== null;
                });
                
                if (summaryH3) {
                  let nextElement = summaryH3.nextElementSibling;
                  const listItems = [];
                  
                  while (nextElement) {
                    if (nextElement.tagName && (nextElement.tagName === 'H2' || nextElement.tagName === 'H3' || nextElement.tagName === 'H4')) {
                      break;
                    }
                    
                    const lis = nextElement.querySelectorAll('li');
                    if (lis.length > 0) {
                      lis.forEach(li => {
                        const text = (li.innerText || li.textContent || '').trim();
                        if (text) {
                          listItems.push(text);
                        }
                      });
                    }
                    
                    nextElement = nextElement.nextElementSibling;
                  }
                  
                  if (listItems.length > 0) {
                    description = listItems.join('\n\n');
                  }
                }
              }
              
              // Priority 3: Get first <p> after .eventcountdown.hidden
              if (!description) {
                const countdownDiv = document.querySelector('.eventcountdown.hidden, .countdownevent.hidden');
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
              
              // Extract times from infobox
              let endTime = null;
              let startTime = null;
              
              const startCell = document.querySelector('td[data-source="time_start"]');
              const endCell = document.querySelector('td[data-source="time_end"]');
              
              if (startCell) {
                const startText = startCell.textContent || '';
                const startMatch = startText.match(/(\d{1,2}):(\d{2})/);
                if (startMatch) {
                  const hour = parseInt(startMatch[1]);
                  const minute = parseInt(startMatch[2]);
                  startTime = { hour, minute };
                }
              }
              
              if (endCell) {
                const endText = endCell.textContent || '';
                const endMatch = endText.match(/(\d{1,2}):(\d{2})/);
                if (endMatch) {
                  const hour = parseInt(endMatch[1]);
                  const minute = parseInt(endMatch[2]);
                  endTime = { hour, minute };
                }
              }
              
              return { description, pageTitle, endTime, startTime };
            });
            
            eventDescription = pageData.description;
            extractedEndTime = pageData.endTime;
            extractedStartTime = pageData.startTime;
            const extractedPageTitle = pageData.pageTitle;
            
            // Use page title if available
            if (extractedPageTitle && extractedPageTitle.length > 0) {
              const cleanedTitle = extractedPageTitle.replace(/^Event\s+/i, '').trim();
              if (cleanedTitle.length > 0) {
                eventName = cleanedTitle;
                console.log(`  ✓ Updated title: "${cleanedTitle}"`);
              }
            }
            
            // For recurring events, append the start date
            const isRecurringEvent = eventName.match(/^(The Final Callback|Shiyu Defense|Deadly Assault)/i);
            if (isRecurringEvent) {
              const dateMatch = event.startDate.match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/);
              if (dateMatch) {
                const [, monthName, day, year] = dateMatch;
                const month = monthToIndex(monthName);
                const formattedDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                
                if (!eventName.includes(formattedDate)) {
                  eventName = `${eventName} ${formattedDate}`;
                  console.log(`  ✓ Added date to recurring event: "${eventName}"`);
                }
              }
            }
            
            if (eventDescription) {
              eventDescription = eventDescription.trim();
              console.log(`  ✓ Description found (${eventDescription.length} chars)`);
              console.log(`  📝 Description preview: ${eventDescription.substring(0, 100)}...`);
            } else {
              eventDescription = 'Event details coming soon.';
              console.log(`  ✗ No description found`);
            }
            
            if (extractedStartTime) {
              console.log(`  ⏰ Found start time: ${extractedStartTime.hour}:${extractedStartTime.minute.toString().padStart(2, '0')}`);
            }
            
            if (extractedEndTime) {
              console.log(`  ⏰ Found end time: ${extractedEndTime.hour}:${extractedEndTime.minute.toString().padStart(2, '0')}`);
            }
          }
          
        } catch (descError) {
          console.log(`  ✗ Error: ${descError.message}`);
          eventDescription = 'Event details coming soon.';
        }
      } else {
        eventDescription = 'Event details coming soon.';
      }
      
      // Apply extracted start time
      if (extractedStartTime) {
        const localHour = extractedStartTime.hour;
        const localMinute = extractedStartTime.minute;
        
        const dateMatch = event.startDate.match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/);
        if (dateMatch) {
          const [, monthName, day, year] = dateMatch;
          const month = monthToIndex(monthName);
          
          const finalDate = Date.UTC(
            parseInt(year), 
            month, 
            parseInt(day), 
            localHour,
            localMinute, 
            0
          );
          
          actualStartDate = finalDate;
          console.log(`  ✓ Start time applied: ${new Date(finalDate).toISOString()}`);
        }
      }
      
      // Apply extracted end time
      if (extractedEndTime) {
        const localHour = extractedEndTime.hour;
        const localMinute = extractedEndTime.minute;
        
        const dateMatch = event.endDate.match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/);
        if (dateMatch) {
          const [, monthName, day, year] = dateMatch;
          const month = monthToIndex(monthName);
          
          const finalDate = Date.UTC(
            parseInt(year), 
            month, 
            parseInt(day), 
            localHour,
            localMinute, 
            0
          );
          
          actualEndDate = finalDate;
          console.log(`  ✓ End time applied: ${new Date(finalDate).toISOString()}`);
        }
      }
      
      // Transform URL: replace underscore before date with slash
      let transformedUrl = event.eventUrl;
      if (transformedUrl) {
        transformedUrl = transformedUrl.replace(/_(\d{4}-\d{2}-\d{2})$/, '/$1');
      }
      
      allEvents.push({
        name: eventName,
        startDate: actualStartDate,
        endDate: actualEndDate,
        endNote: isIndefinite ? 'Permanent' : undefined,
        timezone: 'UTC+8',
        imageUrl: event.imageUrl,
        eventUrl: transformedUrl,
        description: eventDescription
      });
      
      // Save checkpoint every 10 events
      if ((i + 1) % 10 === 0) {
        saveCheckpoint(i, events.length, allEvents);
        console.log(`  💾 Checkpoint saved at event ${i + 1}/${events.length}`);
      }
    }

    console.log(`\n📊 Total processed events: ${allEvents.length}`);

    // Download images
    console.log(`\n🖼️  Starting to process ${allEvents.length} event images...\n`);
    
    for (let i = 0; i < allEvents.length; i++) {
      const event = allEvents[i];
      console.log(`\n[${i + 1}/${allEvents.length}] 🖼️  Processing: ${event.name}`);
      
      try {
        let localImagePath = '';

        if (event.imageUrl || event.eventUrl) {
          console.log(`  Processing image...`);
          
          if (i > 0) {
            console.log(`  ⏳ Waiting 2 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          
          let resolvedImageUrl = '';
          
          // Try to get thumbnail from event page
          if (event.eventUrl && event.eventUrl.includes('/wiki/') && !event.eventUrl.includes('/File:')) {
            try {
              await page.goto(event.eventUrl, { 
                waitUntil: 'domcontentloaded', 
                timeout: 30000
              });
              
              const challengePassed = await waitForCloudflareChallenge(page, 45000);
              
              if (challengePassed) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                await page.waitForSelector('img.pi-image-thumbnail', { timeout: 5000 }).catch(() => {});
                
                const imageUrl = await page.evaluate(() => {
                  const img = document.querySelector('img.pi-image-thumbnail');
                  if (img && img.src) {
                    return img.src.split('/revision')[0];
                  }
                  return null;
                });
                
                if (imageUrl) {
                  console.log(`  ✓ Found thumbnail`);
                  resolvedImageUrl = imageUrl;
                }
              }
            } catch (imgError) {
              console.log(`  ✗ Error: ${imgError.message}`);
            }
          }
          
          // Fallback to table image
          if (!resolvedImageUrl && event.imageUrl && !event.imageUrl.startsWith('data:')) {
            resolvedImageUrl = event.imageUrl;
            if (resolvedImageUrl.startsWith('//')) {
              resolvedImageUrl = 'https:' + resolvedImageUrl;
            }
          }
          
          // Download image
          if (resolvedImageUrl && !resolvedImageUrl.startsWith('data:')) {
            const startDate = new Date(event.startDate);
            const dateStr = `${startDate.getUTCFullYear()}-${String(startDate.getUTCMonth() + 1).padStart(2, '0')}-${String(startDate.getUTCDate()).padStart(2, '0')}`;
            
            const isRecurringEvent = event.name.match(/^(The Final Callback|Shiyu Defense|Deadly Assault)/i);
            
            let imageName;
            if (isRecurringEvent) {
              const baseName = event.name.toLowerCase()
                .replace(/[^a-z0-9\s-]/g, '')
                .replace(/\s+/g, '-')
                .replace(/\s*\d{4}-\d{2}-\d{2}$/, '')
                .substring(0, 40);
              imageName = `${baseName}/${dateStr}`;
            } else {
              imageName = event.name.toLowerCase()
                .replace(/[^a-z0-9\s-]/g, '')
                .replace(/\s+/g, '-')
                .substring(0, 40) + '-' + dateStr;
            }

            try {
              console.log(`  ⬇️  Downloading...`);
              localImagePath = await downloadImage(resolvedImageUrl, 'zenless-zone-zero', imageName, 'events');
              
              if (localImagePath && !localImagePath.startsWith('/images/')) {
                localImagePath = '/images/' + localImagePath.replace(/^\/+/, '');
              }
              
              console.log(`  ✓ Image downloaded: ${localImagePath}`);
            } catch (downloadError) {
              console.log(`  ✗ Download failed: ${downloadError.message}`);
              localImagePath = '';
            }
          }
        }

        event.localImage = localImagePath;

      } catch (error) {
        console.log(`❌ Error: ${error.message}`);
        event.localImage = '';
      }
    }

    // Generate output
    console.log(`\n📝 Generating output files...`);
    
    const jsCode = `// scrapedZZZHistoryEvents.js
// Auto-generated by scrapeZZZHistory.js
// Last updated: ${new Date().toISOString()}

export const scrapedZZZHistoryEvents = [
${allEvents.map(event => `  {
    title: '${event.name.replace(/'/g, "\\'")}',
    start: new Date('${new Date(event.startDate).toISOString()}'),
    end: ${event.endDate === 'Indefinite' ? "'Indefinite'" : `new Date('${new Date(event.endDate).toISOString()}')`},${event.endNote ? `\n    endNote: '${event.endNote}',` : ''}
    timezone: '${event.timezone || 'UTC+8'}',
    image: '${(event.localImage || '').replace(/'/g, "\\'")}',
    description: \`${event.description.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`,
    game: 'Zenless Zone Zero',${event.eventUrl ? `\n    wikiUrl: '${event.eventUrl.replace(/'/g, "\\'")}',` : ''}
  }`).join(',\n')}
];
`;

    const outputPath = path.join(__dirname, '..', 'src', 'data', 'scrapedZZZHistoryEvents.js');
    fs.writeFileSync(outputPath, jsCode);

    console.log(`\n✅ Events saved to: ${outputPath}`);
    console.log(`📊 Total events: ${allEvents.length}`);
    
    // Write JSON backup
    const jsonPath = path.join(__dirname, '..', 'src', 'data', 'scrapedZZZHistoryEvents.json');
    const jsonBackup = allEvents.map(event => ({
      title: event.name,
      start: new Date(event.startDate).toISOString(),
      end: event.endDate === 'Indefinite' ? 'Indefinite' : new Date(event.endDate).toISOString(),
      endNote: event.endNote || undefined,
      timezone: event.timezone || 'UTC+8',
      image: event.localImage || '',
      description: event.description || '',
      game: 'Zenless Zone Zero',
      wikiUrl: event.eventUrl || ''
    }));
    fs.writeFileSync(jsonPath, JSON.stringify(jsonBackup, null, 2));
    console.log(`💾 JSON backup saved to: ${jsonPath}\n`);
    
    // Clear checkpoint on successful completion
    clearCheckpoint();

    await browser.close();
  } catch (error) {
    console.error('❌ Scraper failed:', error);
    await browser.close();
    process.exit(1);
  }
}

scrapeZZZHistory();



