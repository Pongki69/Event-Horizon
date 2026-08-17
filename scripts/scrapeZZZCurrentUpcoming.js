// scrapeZZZCurrentUpcoming.js
// Script to scrape Zenless Zone Zero current and upcoming events from the wiki
// Run with: node scripts/scrapeZZZCurrentUpcoming.js

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { downloadImage, loadExistingImages, resolveImage } from './archiveUtils.js';
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

console.log('Starting Zenless Zone Zero scraper...');

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
 * Parse wiki date format and convert to UTC timestamp
 * ZZZ uses Asia server time (UTC+8), events typically end at 03:59 AM
 */
function parseWikiDate(dateStr, isEnd = false) {
  const dateMatch = dateStr.match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/);

  if (dateMatch) {
    const [, monthName, day, year] = dateMatch;
    const month = monthToIndex(monthName);

    // Fallback: 11:00 UTC+8 = 03:00 UTC for start, 03:59 UTC+8 = 19:59 UTC prev day for end
    const asiaHour = isEnd ? 3 : 11;
    const asiaMinute = isEnd ? 59 : 0;
    const utcHour = asiaHour - 8;
    const dayAdjust = utcHour < 0 ? -1 : 0;
    const utcDate = Date.UTC(parseInt(year), month, parseInt(day) + dayAdjust, (utcHour + 24) % 24, asiaMinute, 0);

    console.log(`Parsed wiki date: ${dateStr} -> ${year}/${month + 1}/${day} ${asiaHour}:${String(asiaMinute).padStart(2,'0')} UTC+8`);
    return utcDate;
  }

  console.log(`Could not parse wiki date: ${dateStr}`);
  return null;
}

async function scrapeZZZEvents() {
  console.log('Starting Zenless Zone Zero events scraping...');

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

    // Fetch events from the official wiki API
    console.log('Fetching events from ZZZ Wiki API...');
    let wikiEvents = [];
    
    // Use about:blank to avoid Cloudflare detection
    await page.goto('about:blank', { waitUntil: 'domcontentloaded' });
    
    try {
      // Use the MediaWiki API to get the Events page content  
      const apiUrl = 'https://zenless-zone-zero.fandom.com/api.php?action=parse&page=Event&prop=text&format=json&origin=*';
      
      const apiResponse = await page.evaluate(async (url) => {
        try {
          const response = await fetch(url);
          return await response.json();
        } catch (error) {
          return { error: error.message };
        }
      }, apiUrl);

      if (apiResponse && apiResponse.parse && apiResponse.parse.text) {
        console.log('✅ Successfully got wiki content via API');
        
        // Parse the HTML content from the API response
        wikiEvents = await page.evaluate((htmlContent) => {
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = htmlContent;
          
          const events = [];
          
          // ZZZ wiki structure: Look for h3 with "Current" or "Upcoming", then find the table after it
          const h3Elements = Array.from(tempDiv.querySelectorAll('h3, h2'));
          
          for (const h3 of h3Elements) {
            const headerText = h3.textContent.trim();
            
            if (headerText === 'Current' || headerText === 'Upcoming') {
              // Find the next table element
              let nextElement = h3.nextElementSibling;
              
              while (nextElement) {
                if (nextElement.tagName === 'TABLE') {
                  // Found the table, extract events
                  const rows = Array.from(nextElement.querySelectorAll('tr'));
                  
                  // Skip the header row (first row)
                  for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    const cells = row.querySelectorAll('td');
                    
                    if (cells.length >= 2) {
                      const eventCell = cells[0];
                      const durationCell = cells[1];
                      const typeCell = cells.length >= 3 ? cells[2] : null;

                      // Get event name and links
                      const eventLink = eventCell.querySelector('a');
                      const eventImage = eventCell.querySelector('img');

                      if (eventLink && durationCell.textContent.trim()) {
                        // Get event name
                        let eventName = eventLink.textContent.trim();
                        
                        if (!eventName || eventName.includes('File:')) {
                          if (eventImage && eventImage.getAttribute('alt')) {
                            eventName = eventImage.getAttribute('alt').trim();
                          } else if (eventLink.getAttribute('title')) {
                            eventName = eventLink.getAttribute('title').trim();
                          }
                        }
                        
                        eventName = eventName.replace(/^File:Event\s+/i, '').replace(/\.(png|jpg|jpeg)$/i, '');
                        
                        // Skip if event name is empty or looks like a section header
                        if (!eventName || eventName === 'Event' || eventName.length < 3) {
                          continue;
                        }
                        
                        let eventUrl = eventLink.getAttribute('href') || '';
                      
                        if (eventUrl && eventUrl.startsWith('/wiki/')) {
                          eventUrl = 'https://zenless-zone-zero.fandom.com' + eventUrl;
                        }
                      
                        const duration = durationCell.textContent.trim();
                        const eventType = typeCell ? typeCell.textContent.trim() : 'In-Game';

                        // Get image URL
                        let imageUrl = '';
                        if (eventImage) {
                          imageUrl = eventImage.getAttribute('src') || eventImage.getAttribute('data-src') || '';
                          
                          if (imageUrl && imageUrl.startsWith('//')) {
                            imageUrl = 'https:' + imageUrl;
                          } else if (imageUrl && imageUrl.startsWith('/')) {
                            imageUrl = 'https://zenless-zone-zero.fandom.com' + imageUrl;
                          }
                        }

                        events.push({
                          name: eventName,
                          duration: duration,
                          type: eventType,
                          url: eventUrl,
                          imageUrl: imageUrl,
                          section: headerText
                        });
                      }
                    }
                  }
                  
                  break; // Found and processed the table, move to next section
                }
                
                // Stop if we hit another h2 or h3 (next section)
                if (nextElement.tagName === 'H2' || nextElement.tagName === 'H3') {
                  break;
                }
                
                nextElement = nextElement.nextElementSibling;
              }
            }
          }

          return events;
        }, apiResponse.parse.text['*']);
        
        console.log(`Found ${wikiEvents.length} events from wiki`);
        
      } else {
        console.log('Failed to get wiki content via API');
      }
    } catch (apiError) {
      console.log('Wiki API access failed:', apiError.message);
    }

    // Process wiki events
    const allEvents = [];

    for (const wikiEvent of wikiEvents) {
      // Parse duration format: "February 09, 2026 – February 23, 2026" or "February 09, 2026 – Permanent"
      const durationMatch = wikiEvent.duration.match(/([A-Za-z]+ \d{1,2}, \d{4})\s*[–-]\s*([A-Za-z]+ \d{1,2}, \d{4}|Permanent)/i);

      if (durationMatch) {
        const [, startDateStr, endDateStr] = durationMatch;

        const startDate = parseWikiDate(startDateStr, false);
        let endDate;
        let isPermanent = false;
        
        if (endDateStr.toLowerCase() === 'permanent') {
          isPermanent = true;
          endDate = startDate + (30 * 24 * 60 * 60 * 1000);
          console.log(`  ℹ Event is permanent, setting 30-day calendar display`);
        } else {
          endDate = parseWikiDate(endDateStr, true);
        }

        if (startDate && endDate) {
          let actualStartDate = startDate;
          let actualEndDate = endDate;
          let eventDescription = '';
          let extractedStartTime = null;
          let extractedEndTime = null;
          
          // Fetch event description and end time from the event page
          if (wikiEvent.url && wikiEvent.url.includes('/wiki/') && !wikiEvent.url.includes('/File:') && !wikiEvent.url.includes('/Special:')) {
            try {
              console.log(`Fetching description for: ${wikiEvent.name}`);
              
              await page.goto(wikiEvent.url, { 
                waitUntil: 'domcontentloaded', 
                timeout: 10000 
              });
              
              const pageData = await page.evaluate(() => {
                let description = '';
                
                // Priority 1: Find <h3> with <span id="Summary"> inside
                const summaryH3 = Array.from(document.querySelectorAll('h3')).find(h3 => {
                  const span = h3.querySelector('span#Summary, span.mw-headline#Summary');
                  return span !== null;
                });
                
                if (summaryH3) {
                  console.log('Found Summary h3');
                  // Find the next element (usually a <ul> or <ol>)
                  let nextElement = summaryH3.nextElementSibling;
                  const listItems = [];
                  
                  while (nextElement) {
                    // If we hit another heading, stop
                    if (nextElement.tagName && (nextElement.tagName === 'H2' || nextElement.tagName === 'H3' || nextElement.tagName === 'H4')) {
                      break;
                    }
                    
                    // Get all <li> elements from this element
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
                  
                  // Convert list items to paragraph format (join with double line breaks for better readability)
                  if (listItems.length > 0) {
                    description = listItems.join('\n\n');
                  }
                }
                
                // Priority 2: Get first <p> after .eventcountdown.hidden or similar
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
                
                // Try to find start and end times from the duration table
                // Extracts time + timezone offset and converts to UTC+8
                let startTime = null;
                let endTime = null;
                const durationTable = document.querySelector('table');
                if (durationTable) {
                  const rows = Array.from(durationTable.querySelectorAll('tr'));
                  for (const row of rows) {
                    const cells = row.querySelectorAll('td, th');
                    for (let i = 0; i < cells.length; i++) {
                      const cellText = cells[i].textContent || '';
                      const isStart = cellText.toLowerCase().includes('start');
                      const isEnd = cellText.toLowerCase().includes('end');
                      if (isStart || isEnd) {
                        const checkCells = [cellText];
                        if (i + 1 < cells.length) checkCells.push(cells[i + 1].textContent || '');
                        for (const text of checkCells) {
                          const match = text.match(/(\d{1,2}):(\d{2})(?:\s*(?:GMT|UTC)([+-]\d+))?/i);
                          if (match) {
                            let hour = parseInt(match[1]);
                            const minute = parseInt(match[2]);
                            const tzOffset = match[3] ? parseInt(match[3]) : 8;
                            // Convert to UTC+8: add (8 - tzOffset) hours
                            let utc8Hour = hour + (8 - tzOffset);
                            let dayShift = 0;
                            if (utc8Hour >= 24) { utc8Hour -= 24; dayShift = 1; }
                            if (utc8Hour < 0) { utc8Hour += 24; dayShift = -1; }
                            if (isStart && !startTime) startTime = { hour: utc8Hour, minute, dayShift };
                            if (isEnd && !endTime) endTime = { hour: utc8Hour, minute, dayShift };
                            break;
                          }
                        }
                      }
                    }
                  }
                }

                // Fallback: scan all tables for time+timezone patterns near start/end keywords
                if (!startTime || !endTime) {
                  const allTables = Array.from(document.querySelectorAll('table'));
                  for (const table of allTables) {
                    const text = table.textContent || '';
                    // Look for patterns like "9 March, 2026 12:00 GMT-7" near start/end
                    const timeMatches = [...text.matchAll(/(\d{1,2}):(\d{2})\s*(?:GMT|UTC)([+-]\d+)/gi)];
                    if (timeMatches.length >= 1 && !startTime) {
                      const m = timeMatches[0];
                      const tzOffset = parseInt(m[3]);
                      let utc8Hour = parseInt(m[1]) + (8 - tzOffset);
                      let dayShift = 0;
                      if (utc8Hour >= 24) { utc8Hour -= 24; dayShift = 1; }
                      if (utc8Hour < 0) { utc8Hour += 24; dayShift = -1; }
                      startTime = { hour: utc8Hour, minute: parseInt(m[2]), dayShift };
                    }
                    if (timeMatches.length >= 2 && !endTime) {
                      const m = timeMatches[1];
                      const tzOffset = parseInt(m[3]);
                      let utc8Hour = parseInt(m[1]) + (8 - tzOffset);
                      let dayShift = 0;
                      if (utc8Hour >= 24) { utc8Hour -= 24; dayShift = 1; }
                      if (utc8Hour < 0) { utc8Hour += 24; dayShift = -1; }
                      endTime = { hour: utc8Hour, minute: parseInt(m[2]), dayShift };
                    }
                    if (startTime && endTime) break;
                  }
                }
                
                return { description, startTime, endTime };
              });
              
              eventDescription = pageData.description;
              extractedEndTime = pageData.endTime;
              extractedStartTime = pageData.startTime;
              
              if (eventDescription) {
                eventDescription = eventDescription.trim();
                console.log(`  ✓ Description found (${eventDescription.length} chars)`);
              } else {
                eventDescription = 'Event details coming soon.';
                console.log(`  ✗ No description found, using fallback`);
              }
              
              if (extractedStartTime) console.log(`  ✓ Found start time: ${extractedStartTime.hour}:${String(extractedStartTime.minute).padStart(2,'0')} UTC+8`);
              if (extractedEndTime) console.log(`  ✓ Found end time: ${extractedEndTime.hour}:${String(extractedEndTime.minute).padStart(2,'0')} UTC+8`);
              
            } catch (descError) {
              console.log(`  ✗ Could not fetch description: ${descError.message}`);
              eventDescription = 'Event details coming soon.';
            }
          } else {
            eventDescription = 'Event details coming soon.';
          }
          
          // Apply extracted times if found, otherwise fallback is already set by parseWikiDate
          // Helper: build UTC timestamp from a wiki date string + extracted time (UTC+8)
          const buildDateWithTime = (wikiDateStr, time, isEnd) => {
            const dateMatch = wikiDateStr.match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/);
            if (!dateMatch) return null;
            const [, monthName, day, year] = dateMatch;
            const month = monthToIndex(monthName);
            if (time) {
              // time.hour is in UTC+8, convert to UTC by subtracting 8
              const utcHour = time.hour - 8;
              const dayShift = (time.dayShift || 0) + (utcHour < 0 ? -1 : 0);
              return Date.UTC(parseInt(year), month, parseInt(day) + dayShift, (utcHour + 24) % 24, time.minute, 0);
            }
            // Fallback: 11:00 UTC+8 = 03:00 UTC for start, 03:59 UTC+8 = 19:59 UTC prev day for end
            const asiaHour = isEnd ? 3 : 11;
            const asiaMinute = isEnd ? 59 : 0;
            const utcHour = asiaHour - 8;
            const dayAdjust = utcHour < 0 ? -1 : 0;
            return Date.UTC(parseInt(year), month, parseInt(day) + dayAdjust, (utcHour + 24) % 24, asiaMinute, 0);
          };

          const startDateStr2 = wikiEvent.duration.match(/([A-Za-z]+ \d{1,2}, \d{4})\s*[–-]/)?.[1];
          const endDateStr2 = wikiEvent.duration.match(/[–-]\s*([A-Za-z]+ \d{1,2}, \d{4})/)?.[1];

          if (extractedStartTime && startDateStr2) {
            actualStartDate = buildDateWithTime(startDateStr2, extractedStartTime, false);
            console.log(`  ✓ Using wiki start time: ${extractedStartTime.hour}:${String(extractedStartTime.minute).padStart(2,'0')} UTC+8`);
          } else {
            console.log(`  ℹ No start time found, using fallback 11:00 UTC+8`);
          }

          if (extractedEndTime && endDateStr2) {
            actualEndDate = buildDateWithTime(endDateStr2, extractedEndTime, true);
            console.log(`  ✓ Using wiki end time: ${extractedEndTime.hour}:${String(extractedEndTime.minute).padStart(2,'0')} UTC+8`);
          } else {
            console.log(`  ℹ No end time found, using fallback 03:59 UTC+8`);
          }
          
          // Clean up event name
          let cleanName = wikiEvent.name
            .replace(/^Event\s+/i, '')
            .replace(/[\s\/]\d{4}-\d{2}-\d{2}$/i, '')  // strip trailing YYYY-MM-DD date
            .replace(/\s+\d+\.\d+$/i, '')               // strip trailing version like "2.7"
            .trim();

          allEvents.push({
            name: cleanName,
            startDate: actualStartDate,
            endDate: actualEndDate,
            isPermanent: isPermanent,
            imageUrl: wikiEvent.imageUrl,
            type: wikiEvent.type,
            duration: wikiEvent.duration,
            eventUrl: wikiEvent.url,
            description: eventDescription,
            source: 'wiki'
          });
        }
      }
    }

    console.log(`Total processed events: ${allEvents.length}`);

    // Filter events (≤100 days duration)
    const filteredEvents = allEvents.filter(event => {
      const duration = event.endDate - event.startDate;
      const days = duration / (1000 * 60 * 60 * 24);
      return days <= 100;
    });

    console.log(`Events after filtering (≤100 days): ${filteredEvents.length}\n`);

    // Disambiguate duplicate event names by appending the start date
    const nameCounts = {};
    for (const event of filteredEvents) {
      nameCounts[event.name] = (nameCounts[event.name] || 0) + 1;
    }
    for (const event of filteredEvents) {
      if (nameCounts[event.name] > 1) {
        const d = new Date(event.startDate);
        const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        event.name = `${event.name} (${dateStr})`;
        console.log(`  Disambiguated: ${event.name}`);
      }
    }

    // Download images
    for (const event of filteredEvents) {
      console.log(`\nProcessing image for: ${event.name}`);
      
      let imageUrl = event.imageUrl;
      
      // Navigate to the event page and get the data-image-key, then open the ?file= page
      if (event.eventUrl && event.eventUrl.includes('/wiki/') && !event.eventUrl.includes('/File:')) {
        try {
          console.log(`  Navigating to event page: ${event.eventUrl}`);
          
          const response = await page.goto(event.eventUrl, { 
            waitUntil: 'domcontentloaded', 
            timeout: 15000,
            referer: 'https://zenless-zone-zero.fandom.com/wiki/Event'
          });
          
          console.log(`  Response status: ${response.status()}`);
          
          // Wait for Cloudflare challenge to complete
          const challengePassed = await waitForCloudflareChallenge(page, 30000);
          
          if (!challengePassed) {
            console.log(`  ✗ Could not pass Cloudflare challenge`);
            continue;
          }
          
          // Wait for page to fully load after challenge (2 seconds)
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Get the data-image-key from the event banner image
          const imageData = await page.evaluate(() => {
            // Debug: Check what figures exist on the page
            const allFigures = document.querySelectorAll('figure');
            console.log(`Found ${allFigures.length} figure elements on page`);
            
            // Try to find the main event image - priority order:
            // 1. figure.pi-item.pi-image with data-source="image"
            // 2. infobox image with data-image-key
            // 3. image with "Event_" in data-image-key
            // 4. first image with data-image-key
            
            let img = null;
            let dataImageKey = '';
            
            // 1. Try figure with data-source="image" (most reliable for event images)
            const figure = document.querySelector('figure.pi-item.pi-image[data-source="image"]');
            if (figure) {
              img = figure.querySelector('img');
              if (img) {
                dataImageKey = img.getAttribute('data-image-key') || '';
                console.log(`Found figure.pi-item.pi-image with data-image-key: "${dataImageKey}"`);
              }
            }
            
            // 2. Try infobox image
            if (!dataImageKey) {
              img = document.querySelector('.infoboxtable img[data-image-key], .portable-infobox img[data-image-key]');
              if (img) {
                dataImageKey = img.getAttribute('data-image-key') || '';
                console.log(`Found infobox image with data-image-key: "${dataImageKey}"`);
              }
            }
            
            // 3. Try to find image with "Event_" in the key
            if (!dataImageKey) {
              const allImages = document.querySelectorAll('img[data-image-key]');
              for (const image of allImages) {
                const key = image.getAttribute('data-image-key');
                if (key && key.startsWith('Event_')) {
                  dataImageKey = key;
                  console.log(`Found Event_ image with data-image-key: "${dataImageKey}"`);
                  break;
                }
              }
            }
            
            // 4. Fallback to first image with data-image-key
            if (!dataImageKey) {
              img = document.querySelector('img[data-image-key]');
              if (img) {
                dataImageKey = img.getAttribute('data-image-key') || '';
                console.log(`Found first image with data-image-key: "${dataImageKey}"`);
              }
            }
            
            if (!dataImageKey) {
              console.log(`No image with data-image-key found`);
            }
            
            return { dataImageKey };
          });
          
          if (imageData.dataImageKey) {
            console.log(`  ✓ Found data-image-key: ${imageData.dataImageKey}`);
            
            // Construct direct image URL from data-image-key and strip /revision/ for HD
            const decodedKey = decodeURIComponent(imageData.dataImageKey);
            const directUrl = `https://static.wikia.nocookie.net/zenless-zone-zero/images/${decodedKey}`;
            
            // Try to get the actual URL by navigating to the file page
            const imagePageUrl = `https://zenless-zone-zero.fandom.com/wiki/Special:FilePath/${encodeURIComponent(decodedKey)}`;
            
            try {
              const response = await page.goto(imagePageUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 15000
              });
              
              // The final URL after redirect is the direct image URL
              const finalUrl = page.url();
              if (finalUrl && !finalUrl.includes('Special:FilePath') && finalUrl.includes('wikia.nocookie.net')) {
                imageUrl = finalUrl.replace(/\/revision\/.*$/, '');
                console.log(`  ✓ Resolved image URL: ${imageUrl.substring(0, 100)}...`);
              } else {
                // Fallback: use the img src from the event page thumbnail, strip /revision/
                imageUrl = '';
              }
            } catch (e) {
              imageUrl = '';
            }
          } else {
            console.log(`  ✗ No data-image-key found on event page`);
          }
        } catch (imgError) {
          console.log(`  ✗ Error getting full-res image: ${imgError.message}`);
        }
      }
      
      // Download the image
      if (imageUrl && !imageUrl.startsWith('data:')) {
        console.log(`  → Downloading from: ${imageUrl.substring(0, 120)}...`);
        const imagePath = await downloadImage(
          imageUrl,
          'zenless-zone-zero',
          event.name,
          'events'
        );
        
        if (imagePath) {
          console.log(`  ✓ Image downloaded: ${imagePath}`);
          event.localImage = imagePath;
        }
      } else {
        console.log(`  ✗ No valid image URL found, continuing without image`);
      }
    }

    // Generate output file
    console.log(`Processing ${filteredEvents.length} events for file generation...`);

    const outputPath = path.join(__dirname, '..', 'src', 'data', 'scrapedZZZEvents.js');
    const existingImageMap = await loadExistingImages(outputPath, 'scrapedZZZEvents');

    const jsCode = `// scrapedZZZEvents.js
// Auto-generated by scrapeZZZCurrentUpcoming.js
// Last updated: ${new Date().toISOString()}

export const scrapedZZZEvents = [
${filteredEvents.map(event => `  {
    title: '${event.name.replace(/'/g, "\\'")}',
    start: new Date('${new Date(event.startDate).toISOString()}'),
    end: new Date('${new Date(event.endDate).toISOString()}'),${event.isPermanent ? `\n    endNote: 'Permanent',` : ''}
    image: '${resolveImage(event.localImage, event.name, existingImageMap).replace(/'/g, "\\'")}',
    description: \`${event.description.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`,
    game: 'Zenless Zone Zero',
  }`).join(',\n')}
];
`;

    fs.writeFileSync(outputPath, jsCode);
    console.log(`✅ Events saved to: ${outputPath}`);
    console.log(`📊 Total events: ${filteredEvents.length}\n`);
    
    // Also write to history file (merge with existing)
    const historyOutputPath = path.join(__dirname, '..', 'src', 'data', 'scrapedZZZHistoryEvents.js');
    let existingHistoryEvents = [];
    
    // Try to read existing history file
    try {
      const { scrapedZZZHistoryEvents } = await import(`file://${historyOutputPath}?t=${Date.now()}`);
      existingHistoryEvents = scrapedZZZHistoryEvents || [];
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
    filteredEvents.forEach(event => {
      const key = `${event.name}|||${new Date(event.startDate).toISOString()}`;
      eventsMap.set(key, {
        title: event.name,
        start: new Date(event.startDate),
        end: event.isTBA || event.isPermanent ? 'Indefinite' : new Date(event.endDate),
        image: event.localImage || '',
        description: event.description,
        game: 'Zenless Zone Zero'
      });
    });
    
    // Deduplicate events that are the same event but scraped with slightly different titles
    // (e.g. "Extensive Patrol Triple Bounty" vs "Extensive Patrol: Triple Bounty")
    // Match by: normalized title (strip punctuation) + same UTC day
    // Keep the entry with MORE special characters (colons, smart quotes) in the title,
    // and prefer the one with a real description if descriptions differ.

    const normalizeForDedup = (title) => title
      .toLowerCase()
      .replace(/[:\-'""\u2018\u2019\u201c\u201d!?.]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const specialCharScore = (title) => {
      const matches = title.match(/[:!\u2018\u2019\u201c\u201d]/g);
      return matches ? matches.length : 0;
    };

    const toUtcDay = (date) => {
      const d = new Date(date);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
    };

    const PLACEHOLDER_DESC = 'Event details coming soon.';
    const hasRealDesc = (ev) => {
      const d = ev.description || '';
      return d.trim().length > 0 && d.trim() !== PLACEHOLDER_DESC;
    };

    const mergedEventsArray = Array.from(eventsMap.values());
    const keysToRemove = new Set();

    for (let i = 0; i < mergedEventsArray.length; i++) {
      if (keysToRemove.has(`${mergedEventsArray[i].title}|||${new Date(mergedEventsArray[i].start).toISOString()}`)) continue;
      for (let j = i + 1; j < mergedEventsArray.length; j++) {
        if (keysToRemove.has(`${mergedEventsArray[j].title}|||${new Date(mergedEventsArray[j].start).toISOString()}`)) continue;

        const e1 = mergedEventsArray[i];
        const e2 = mergedEventsArray[j];

        // Must be within 2 days of each other (handles UTC offset edge cases)
        const dayDiff = Math.abs(new Date(e1.start) - new Date(e2.start)) / (1000 * 60 * 60 * 24);
        if (dayDiff > 2) continue;

        // Must normalize to the same title
        if (normalizeForDedup(e1.title) !== normalizeForDedup(e2.title)) continue;

        // They are duplicates — decide what to keep
        const score1 = specialCharScore(e1.title);
        const score2 = specialCharScore(e2.title);

        // Always prefer the title with more special characters (more accurate/complete)
        // Tiebreak: longer title wins
        const betterTitleIdx = score1 > score2 ? i : (score2 > score1 ? j : (e1.title.length >= e2.title.length ? i : j));
        const worseTitleIdx  = betterTitleIdx === i ? j : i;

        const keepEvent   = mergedEventsArray[betterTitleIdx];
        const removeEvent = mergedEventsArray[worseTitleIdx];

        // Use the earlier end time (more accurate — the one ending sooner is the live countdown)
        const end1 = keepEvent.end === 'Indefinite' ? Infinity : new Date(keepEvent.end).getTime();
        const end2 = removeEvent.end === 'Indefinite' ? Infinity : new Date(removeEvent.end).getTime();
        if (end2 < end1 && end2 !== Infinity) {
          keepEvent.end   = removeEvent.end;
          keepEvent.start = removeEvent.start;
        }

        // Carry over real description if keep entry lacks one
        if (!hasRealDesc(keepEvent) && hasRealDesc(removeEvent)) {
          keepEvent.description = removeEvent.description;
        }
        // Carry over image if keep entry lacks one
        if (!keepEvent.image && removeEvent.image) {
          keepEvent.image = removeEvent.image;
        }

        const removeKey = `${removeEvent.title}|||${new Date(removeEvent.start).toISOString()}`;
        keysToRemove.add(removeKey);
        console.log(`  Dedup: removing "${removeEvent.title}" keeping "${keepEvent.title}"`);
      }
    }

    // Remove the duplicates
    keysToRemove.forEach(key => eventsMap.delete(key));
    
    // Convert to array and sort by start date (newest first)
    const mergedEvents = Array.from(eventsMap.values())
      .sort((a, b) => new Date(b.start) - new Date(a.start));
    
    const historyJsCode = `// scrapedZZZHistoryEvents.js
// Auto-generated by scrapeZZZCurrentUpcoming.js
// Last updated: ${new Date().toISOString()}

export const scrapedZZZHistoryEvents = [
${mergedEvents.map(event => {
      const startDate = new Date(event.start);
      const isIndefinite = event.end === 'Indefinite' || event.end === 'TBA';
      const endDate = isIndefinite ? null : new Date(event.end);

      if (isNaN(startDate.getTime())) {
        console.warn(`⚠️ Skipping event with invalid start date: ${event.title}`);
        return null;
      }
      if (!isIndefinite && isNaN(endDate.getTime())) {
        console.warn(`⚠️ Skipping event with invalid end date: ${event.title}`);
        return null;
      }

      return `  {
    title: '${event.title.replace(/'/g, "\\'")}',
    start: new Date('${startDate.toISOString()}'),
    end: ${isIndefinite ? "'Indefinite'" : `new Date('${endDate.toISOString()}')`},${isIndefinite ? `\n    endNote: 'Permanent',` : ''}
    image: '${(event.image || '').replace(/'/g, "\\'")}',
    description: \`${(event.description || '').replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`,
    game: 'Zenless Zone Zero',
  }`;
    }).filter(Boolean).join(',\n')}
];
`;

    fs.writeFileSync(historyOutputPath, historyJsCode);

    console.log(`✅ Events also saved to: ${historyOutputPath}`);
    console.log(`📊 Total history events: ${mergedEvents.length} (${mergedEvents.length - existingHistoryEvents.length} new)\n`);
    
    // Save JSON backup
    const jsonBackup = mergedEvents
      .filter(event => {
        const startDate = new Date(event.start);
        const isIndefinite = event.end === 'Indefinite' || event.end === 'TBA';
        const endDate = isIndefinite ? null : new Date(event.end);
        return !isNaN(startDate.getTime()) && (isIndefinite || !isNaN(endDate.getTime()));
      })
      .map(event => {
        const isIndefinite = event.end === 'Indefinite' || event.end === 'TBA';
        return {
          title: event.title,
          start: new Date(event.start).toISOString(),
          end: isIndefinite ? 'Indefinite' : new Date(event.end).toISOString(),
          endNote: isIndefinite ? 'Permanent' : event.endNote,
          image: event.image || '',
          description: event.description || '',
          game: 'Zenless Zone Zero',
          wikiUrl: event.wikiUrl || ''
        };
      });
    const jsonPath = path.join(__dirname, '..', 'src', 'data', 'scrapedZZZHistoryEvents.json');
    fs.writeFileSync(jsonPath, JSON.stringify(jsonBackup, null, 2));
    console.log(`💾 JSON backup saved to: ${jsonPath}\n`);
    
    if (filteredEvents.length > 0) {
      console.log('📅 Sample events:');
      filteredEvents.slice(0, 3).forEach(event => {
        console.log(`  - ${event.name} (${new Date(event.startDate).toISOString()} to ${new Date(event.endDate).toISOString()})`);
      });
    }

    await browser.close();
  } catch (error) {
    console.error('Error during scraping:', error);
    await browser.close();
    process.exit(1);
  }
}

scrapeZZZEvents();
