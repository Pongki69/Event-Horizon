// scrapeZZZHistoryIndefinite.js
// Script to scrape only Indefinite/TBA events from ZZZ history
// Run with: node scripts/scrapeZZZHistoryIndefinite.js

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { downloadImage } from './archiveUtils.js';
import { loginToFandom } from './fandomLogin.js';

puppeteer.use(StealthPlugin());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
 */
function parseWikiDate(dateStr) {
  const dateMatch = dateStr.match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/);

  if (dateMatch) {
    const [, monthName, day, year] = dateMatch;
    const month = monthToIndex(monthName);
    const dateTime = Date.UTC(parseInt(year), month, parseInt(day), 3, 59, 0);
    return dateTime;
  }

  return null;
}

async function scrapeIndefiniteEvents() {
  console.log('\n🚀 Starting ZZZ Indefinite Events scraper...\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process'
    ],
    protocolTimeout: 180000
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

    console.log('✅ Page loaded, extracting Indefinite events...\n');
    
    await page.waitForSelector('body', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Extract only events with Indefinite/TBA end dates
    const events = await page.evaluate(() => {
      const eventData = [];
      
      const h2Elements = document.querySelectorAll('h2');
      let targetH2 = null;
      
      for (const h2 of h2Elements) {
        const span = h2.querySelector('span');
        if (span && span.textContent.includes('All Events')) {
          targetH2 = h2;
          break;
        }
      }
      
      if (!targetH2) {
        return [];
      }
      
      let element = targetH2.nextElementSibling;
      
      while (element) {
        if (element.tagName === 'H2') {
          break;
        }
        
        if (element.tagName === 'TABLE') {
          const rows = element.querySelectorAll('tr');
          
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const cells = row.querySelectorAll('td');
            
            if (cells.length < 4) continue;
            
            const endDateText = cells[3].textContent.trim();
            
            // Only process events with Indefinite or TBA end dates
            if (!endDateText.toLowerCase().includes('indefinite') && !endDateText.toLowerCase().includes('tba')) {
              continue;
            }
            
            const imageCell = cells[0];
            const img = imageCell.querySelector('img');
            const imageUrl = img ? (img.getAttribute('data-src') || img.getAttribute('src') || '') : '';
            
            const nameCell = cells[1];
            const nameLink = nameCell.querySelector('a');
            if (!nameLink) continue;
            
            const eventName = nameLink.textContent.trim();
            let eventUrl = nameLink.getAttribute('href') || '';
            
            if (eventUrl && eventUrl.startsWith('/wiki/')) {
              eventUrl = 'https://zenless-zone-zero.fandom.com' + eventUrl;
            }
            
            const startDateText = cells[2].textContent.trim();
            
            if (!startDateText) continue;
            
            eventData.push({
              name: eventName,
              startDate: startDateText,
              endDate: endDateText,
              imageUrl: imageUrl,
              eventUrl: eventUrl
            });
          }
        }
        
        element = element.nextElementSibling;
      }
      
      return eventData;
    });

    console.log(`📋 Found ${events.length} Indefinite/TBA events\n`);

    const allEvents = [];

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      console.log(`\n[${i + 1}/${events.length}] 📄 Processing: ${event.name}`);
      console.log(`  Start: ${event.startDate}`);
      console.log(`  End: ${event.endDate}`);
      
      const startDate = parseWikiDate(event.startDate);
      
      if (!startDate) {
        console.log(`  ✗ Skipping: invalid start date`);
        continue;
      }
      
      // Set end date to 1 year from start for Indefinite events
      const actualEndDate = startDate + (365 * 24 * 60 * 60 * 1000);
      console.log(`  ℹ️ Event is Permanent/Indefinite - setting 1 year duration`);
      
      let actualStartDate = startDate;
      let eventDescription = '';
      let extractedEndTime = null;
      let extractedStartTime = null;
      let eventName = event.name;
      
      // Fetch event details
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
            
            await page.waitForSelector('.mw-parser-output, p', { timeout: 5000 }).catch(() => {});
          
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
              
              // Priority 2: Find Summary section
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
              
              // Extract times
              let endTime = null;
              let startTime = null;
              
              const startCell = document.querySelector('td[data-source="time_start"]');
              const endCell = document.querySelector('td[data-source="time_end"]');
              
              if (startCell) {
                const startText = startCell.textContent || '';
                const startMatch = startText.match(/(\d{1,2}):(\d{2})/);
                if (startMatch) {
                  startTime = { hour: parseInt(startMatch[1]), minute: parseInt(startMatch[2]) };
                }
              }
              
              if (endCell) {
                const endText = endCell.textContent || '';
                const endMatch = endText.match(/(\d{1,2}):(\d{2})/);
                if (endMatch) {
                  endTime = { hour: parseInt(endMatch[1]), minute: parseInt(endMatch[2]) };
                }
              }
              
              return { description, pageTitle, endTime, startTime };
            });
            
            eventDescription = pageData.description;
            extractedEndTime = pageData.endTime;
            extractedStartTime = pageData.startTime;
            const extractedPageTitle = pageData.pageTitle;
            
            if (extractedPageTitle && extractedPageTitle.length > 0) {
              const cleanedTitle = extractedPageTitle.replace(/^Event\s+/i, '').trim();
              if (cleanedTitle.length > 0) {
                eventName = cleanedTitle;
                console.log(`  ✓ Updated title: "${cleanedTitle}"`);
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
          
          actualStartDate = Date.UTC(
            parseInt(year), 
            month, 
            parseInt(day), 
            localHour,
            localMinute, 
            0
          );
          
          console.log(`  ✓ Start time applied: ${new Date(actualStartDate).toISOString()}`);
        }
      }
      
      // Transform URL
      let transformedUrl = event.eventUrl;
      if (transformedUrl) {
        transformedUrl = transformedUrl.replace(/_(\d{4}-\d{2}-\d{2})$/, '/$1');
      }
      
      // Download image
      let localImagePath = '';
      
      if (event.eventUrl && event.eventUrl.includes('/wiki/') && !event.eventUrl.includes('/File:')) {
        try {
          console.log(`  🖼️  Fetching thumbnail...`);
          
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
              
              const startDate = new Date(actualStartDate);
              const dateStr = `${startDate.getUTCFullYear()}-${String(startDate.getUTCMonth() + 1).padStart(2, '0')}-${String(startDate.getUTCDate()).padStart(2, '0')}`;
              
              const imageName = eventName.toLowerCase()
                .replace(/[^a-z0-9\s-]/g, '')
                .replace(/\s+/g, '-')
                .substring(0, 40) + '-' + dateStr;

              console.log(`  ⬇️  Downloading...`);
              localImagePath = await downloadImage(imageUrl, 'zenless-zone-zero', imageName, 'events');
              
              if (localImagePath && !localImagePath.startsWith('/images/')) {
                localImagePath = '/images/' + localImagePath.replace(/^\/+/, '');
              }
              
              console.log(`  ✓ Image downloaded: ${localImagePath}`);
            }
          }
        } catch (imgError) {
          console.log(`  ✗ Image error: ${imgError.message}`);
        }
      }
      
      allEvents.push({
        name: eventName,
        startDate: actualStartDate,
        endDate: 'Indefinite',
        endNote: 'Permanent',
        timezone: 'UTC+8',
        imageUrl: event.imageUrl,
        eventUrl: transformedUrl,
        description: eventDescription,
        localImage: localImagePath
      });
    }

    console.log(`\n📊 Total Indefinite events processed: ${allEvents.length}\n`);
    
    // Save to JSON
    const jsonPath = path.join(__dirname, 'zzz-indefinite-events.json');
    fs.writeFileSync(jsonPath, JSON.stringify(allEvents, null, 2));
    console.log(`✅ Saved to: ${jsonPath}\n`);

    await browser.close();
  } catch (error) {
    console.error('❌ Scraper failed:', error);
    await browser.close();
    process.exit(1);
  }
}

scrapeIndefiniteEvents();
