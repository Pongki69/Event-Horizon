// scrapeGenshinCurrentUpcoming.js
// Script to scrape Genshin Impact current and upcoming events
// Run with: node scripts/scrapeGenshinCurrentUpcoming.js

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { downloadImage, loadExistingImages, resolveImage } from './archiveUtils.js';
import { loginToFandom } from './fandomLogin.js';

puppeteer.use(StealthPlugin());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Starting Genshin Impact scraper...\n');

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

function parseWikiDate(dateStr, isEndDate = false) {
  const dateMatch = dateStr.match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);

  if (dateMatch) {
    const [, monthName, day, year, hourStr, minuteStr] = dateMatch;
    const month = monthToIndex(monthName);
    const defaultHour = isEndDate ? 3 : 10;
    const defaultMinute = isEndDate ? 59 : 0;
    const hour = hourStr ? parseInt(hourStr) : defaultHour;
    const minute = minuteStr ? parseInt(minuteStr) : defaultMinute;
    // Wiki times are in UTC+8 (Server Time), convert to UTC by subtracting 8 hours
    const utcTime = Date.UTC(parseInt(year), month, parseInt(day), hour - 8, minute, 0);
    
    return utcTime;
  }

  return null;
}

async function scrapeGenshinEvents() {
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
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    await loginToFandom(page);

    console.log('Navigating to wiki...');
    
    // Use MediaWiki API to bypass Cloudflare - same approach as ZZZ scraper
    await page.goto('about:blank', { waitUntil: 'domcontentloaded' });
    
    const apiUrl = 'https://genshin-impact.fandom.com/api.php?action=parse&page=Event&prop=text&format=json&origin=*';
    
    const apiResponse = await page.evaluate(async (url) => {
      try {
        const response = await fetch(url);
        return await response.json();
      } catch (error) {
        return { error: error.message };
      }
    }, apiUrl);

    if (!apiResponse || !apiResponse.parse || !apiResponse.parse.text) {
      console.log('❌ Failed to get wiki content via API, falling back to direct navigation...');
      await page.goto('https://genshin-impact.fandom.com/wiki/Event', { 
        waitUntil: 'domcontentloaded', 
        timeout: 60000 
      });
      await page.waitForFunction(
        () => !document.title.includes('Just a moment'),
        { timeout: 30000, polling: 1000 }
      ).catch(() => {});
      await new Promise(r => setTimeout(r, 3000));
    } else {
      console.log('✅ Successfully got wiki content via API');
    }

    console.log('✓ Page loaded\n');
    
    const wikiEvents = await page.evaluate((htmlContent) => {
      const events = [];
      const sections = ['Current', 'Upcoming'];
      
      // Use API HTML content if available, otherwise use page DOM
      let searchRoot;
      if (htmlContent) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;
        searchRoot = tempDiv;
      } else {
        searchRoot = document;
      }
      
      for (const sectionName of sections) {
        const sectionHeader = Array.from(searchRoot.querySelectorAll('h3')).find(h =>
          h.textContent.includes(sectionName)
        );

        if (sectionHeader) {
          let nextElement = sectionHeader.nextElementSibling;
          while (nextElement && nextElement.tagName !== 'TABLE') {
            nextElement = nextElement.nextElementSibling;
          }

          if (nextElement && nextElement.tagName === 'TABLE') {
            const rows = nextElement.querySelectorAll('tr');

            for (let i = 1; i < rows.length; i++) {
              const row = rows[i];
              const cells = row.querySelectorAll('td');

              if (cells.length >= 3) {
                const eventCell = cells[0];
                const durationCell = cells[1];
                const typeCell = cells[2];

                const eventLink = eventCell.querySelector('a');
                const eventImage = eventCell.querySelector('img');
                const allLinks = eventCell.querySelectorAll('a');
                const titleLink = allLinks.length > 1 ? allLinks[1] : eventLink;

                if (titleLink && durationCell.textContent.trim()) {
                  let eventName = titleLink.textContent.trim();
                  eventName = eventName.replace(/^File:Event\s+/i, '').replace(/\.(png|jpg|jpeg)$/i, '');
                  
                  let eventUrl = titleLink.getAttribute('href') || '';
                  if (eventUrl && eventUrl.startsWith('/wiki/')) {
                    eventUrl = 'https://genshin-impact.fandom.com' + eventUrl;
                  }
                  
                  let duration = '';
                  const fullText = durationCell.textContent.trim();
                  
                  const nestedTable = durationCell.querySelector('table');
                  if (nestedTable) {
                    const startCell = nestedTable.querySelector('[data-source="time_start"]');
                    const endCell = nestedTable.querySelector('[data-source="time_end"]');
                    
                    if (startCell && endCell) {
                      duration = `${startCell.textContent.trim()} – ${endCell.textContent.trim()}`;
                    }
                  }
                  
                  if (!duration && fullText.includes('Start') && fullText.includes('End')) {
                    const startMatch = fullText.match(/Start\s+([\s\S]+?)End\s+([\s\S]+?)(?:Information|$)/);
                    if (startMatch) {
                      const startText = startMatch[1].trim().replace(/\s+/g, ' ');
                      const endText = startMatch[2].trim().replace(/\s+/g, ' ');
                      duration = `${startText} – ${endText}`;
                    }
                  }
                  
                  if (!duration) {
                    duration = fullText;
                  }
                  
                  const eventType = typeCell.textContent.trim();

                  let imageUrl = '';
                  let originalImageSrc = '';
                  
                  if (eventImage) {
                    originalImageSrc = eventImage.getAttribute('src') || eventImage.getAttribute('data-src') || '';
                    imageUrl = originalImageSrc;
                  }
                  
                  if (imageUrl && imageUrl.startsWith('//')) {
                    imageUrl = 'https:' + imageUrl;
                  } else if (imageUrl && imageUrl.startsWith('/')) {
                    imageUrl = 'https://genshin-impact.fandom.com' + imageUrl;
                  }
                  
                  if (originalImageSrc && originalImageSrc.startsWith('//')) {
                    originalImageSrc = 'https:' + originalImageSrc;
                  } else if (originalImageSrc && originalImageSrc.startsWith('/')) {
                    originalImageSrc = 'https://genshin-impact.fandom.com' + originalImageSrc;
                  }

                  events.push({
                    name: eventName,
                    duration: duration,
                    type: eventType,
                    url: eventUrl,
                    imageUrl: imageUrl,
                    originalImageSrc: originalImageSrc
                  });
                }
              }
            }
          }
        }
      }

      return events;
    }, apiResponse?.parse?.text?.['*'] || null);
    
    console.log(`Found ${wikiEvents.length} events`);

    // Deduplicate events - only skip if BOTH image AND name are very similar
    const seenEvents = new Map();
    const uniqueEvents = [];
    
    for (const event of wikiEvents) {
      let isDuplicate = false;
      
      // Check against all existing events
      for (const [key, existing] of seenEvents) {
        const sameImage = event.imageUrl && existing.imageUrl && event.imageUrl === existing.imageUrl;
        const similarName = event.name.toLowerCase().trim() === existing.name.toLowerCase().trim();
        
        // Only mark as duplicate if BOTH conditions are true
        if (sameImage && similarName) {
          console.log(`⚠️  Duplicate detected: "${event.name}" - skipping`);
          isDuplicate = true;
          break;
        }
      }
      
      if (!isDuplicate) {
        seenEvents.set(event.name, event);
        uniqueEvents.push(event);
      }
    }
    
    console.log(`After deduplication: ${uniqueEvents.length} unique events\n`);

    const allEvents = [];

    for (const wikiEvent of uniqueEvents) {
      let startDate = null;
      let endDate = null;
      let isPermanent = false;
      
      const newFormatMatch = wikiEvent.duration.match(/(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})\s*[–-]\s*(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/);
      
      if (newFormatMatch) {
        const [, startYear, startMonth, startDay, startHour, startMinute, endYear, endMonth, endDay, endHour, endMinute] = newFormatMatch;
        
        startDate = Date.UTC(
          parseInt(startYear),
          parseInt(startMonth) - 1,
          parseInt(startDay),
          parseInt(startHour),
          parseInt(startMinute),
          0
        );
        
        endDate = Date.UTC(
          parseInt(endYear),
          parseInt(endMonth) - 1,
          parseInt(endDay),
          parseInt(endHour),
          parseInt(endMinute),
          0
        );
      } else {
        const durationMatch = wikiEvent.duration.match(/([A-Za-z]+ \d{1,2}, \d{4}(?:\s+\d{1,2}:\d{2})?(?:\s*\([^)]+\))?)\s*[–-]\s*([A-Za-z]+ \d{1,2}, \d{4}(?:\s+\d{1,2}:\d{2})?(?:\s*\([^)]+\))?|Permanent)/i);

        if (durationMatch) {
          const [, startDateStr, endDateStr] = durationMatch;

          startDate = parseWikiDate(startDateStr, false);
          
          if (endDateStr.toLowerCase() === 'permanent') {
            isPermanent = true;
            endDate = startDate + (30 * 24 * 60 * 60 * 1000);
          } else {
            endDate = parseWikiDate(endDateStr, true);
          }
        }
      }

      if (startDate && endDate) {
        let actualStartDate = startDate;
        let actualEndDate = endDate;
        let eventDescription = '';
        
        if (wikiEvent.url && wikiEvent.url.includes('/wiki/') && !wikiEvent.url.includes('/File:') && !wikiEvent.url.includes('/Special:')) {
          try {
            console.log(`Fetching: ${wikiEvent.name}`);
            
            await page.goto(wikiEvent.url, { 
              waitUntil: 'domcontentloaded', 
              timeout: 10000 
            });
            
            const pageData = await page.evaluate(() => {
              let description = '';
              let startTime = null;
              let endTime = null;
              
              const durationSection = document.querySelector('.pi-horizontal-group');
              
              if (durationSection) {
                const tbody = durationSection.querySelector('tbody');
                
                let startCell = tbody ? tbody.querySelector('[data-source="time_start"]') : durationSection.querySelector('[data-source="time_start"]');
                let endCell = tbody ? tbody.querySelector('[data-source="time_end"]') : durationSection.querySelector('[data-source="time_end"]');
                
                if (!startCell || !endCell) {
                  const searchArea = tbody || durationSection;
                  const allCells = searchArea.querySelectorAll('td');
                  
                  for (const cell of allCells) {
                    const text = cell.textContent.trim();
                    if (text.match(/[A-Za-z]+\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}/)) {
                      if (!startCell) {
                        startCell = cell;
                      } else if (!endCell) {
                        endCell = cell;
                      }
                    }
                  }
                }
                
                if (startCell) {
                  const startText = startCell.textContent.trim();
                  const startMatch = startText.match(/([A-Za-z]+\s+\d{1,2},\s+\d{4})\s+(\d{1,2}):(\d{2})/);
                  if (startMatch) {
                    startTime = {
                      date: startMatch[1],
                      hour: parseInt(startMatch[2]),
                      minute: parseInt(startMatch[3])
                    };
                  }
                }
                
                if (endCell) {
                  const endText = endCell.textContent.trim();
                  const endMatch = endText.match(/([A-Za-z]+\s+\d{1,2},\s+\d{4})\s+(\d{1,2}):(\d{2})/);
                  if (endMatch) {
                    endTime = {
                      date: endMatch[1],
                      hour: parseInt(endMatch[2]),
                      minute: parseInt(endMatch[3])
                    };
                  }
                }
              }
              
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
              
              if (!description) {
                const outfitH2 = Array.from(document.querySelectorAll('h2')).find(h2 => {
                  const span = h2.querySelector('span#Outfit_Details, span.mw-headline#Outfit_Details');
                  return span !== null;
                });
                
                if (outfitH2) {
                  let nextElement = outfitH2.nextElementSibling;
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
              
              if (!description) {
                const countdownDiv = document.querySelector('.eventcountdown.hidden');
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
              
              return { description, startTime, endTime };
            });
            
            eventDescription = pageData.description;
            const extractedStartTime = pageData.startTime;
            const extractedEndTime = pageData.endTime;
            
            if (eventDescription) {
              eventDescription = eventDescription.trim();
              console.log(`  ✓ Description (${eventDescription.length} chars)`);
            } else {
              eventDescription = 'Event details coming soon.';
              console.log(`  ✗ No description`);
            }
            
            if (extractedStartTime) {
              const startDateWithTime = `${extractedStartTime.date} ${extractedStartTime.hour}:${extractedStartTime.minute.toString().padStart(2, '0')}`;
              const newStartDate = parseWikiDate(startDateWithTime, false);
              if (newStartDate) {
                actualStartDate = newStartDate;
              }
            }
            
            if (extractedEndTime) {
              const endDateWithTime = `${extractedEndTime.date} ${extractedEndTime.hour}:${extractedEndTime.minute.toString().padStart(2, '0')}`;
              const newEndDate = parseWikiDate(endDateWithTime, true);
              if (newEndDate) {
                actualEndDate = newEndDate;
              }
            }
            
          } catch (descError) {
            console.log(`  ✗ Error: ${descError.message}`);
            eventDescription = 'Event details coming soon.';
          }
        } else {
          eventDescription = 'Event details coming soon.';
        }
        
        let cleanName = wikiEvent.name
          .replace(/^Event\s+/i, '')
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

    console.log(`\nTotal processed: ${allEvents.length}`);

    const filteredEvents = allEvents.filter(event => {
      const duration = event.endDate - event.startDate;
      const days = duration / (1000 * 60 * 60 * 24);
      return days <= 100;
    });

    console.log(`After filtering: ${filteredEvents.length}\n`);

    for (const event of filteredEvents) {
      console.log(`\nProcessing image: ${event.name}`);
      
      if (event.eventUrl && event.eventUrl.includes('/wiki/')) {
        try {
          await page.goto(event.eventUrl, { 
            waitUntil: 'domcontentloaded', 
            timeout: 30000
          });
          
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const imageUrl = await page.evaluate(() => {
            const img = document.querySelector('img.pi-image-thumbnail');
            if (img && img.src) {
              return img.src.split('/revision')[0];
            }
            return null;
          });
          
          if (imageUrl) {
            console.log(`  ✓ Found image`);
            event.imageUrl = imageUrl;
          } else {
            console.log(`  ✗ No image`);
          }
        } catch (imgError) {
          console.log(`  ✗ Error: ${imgError.message}`);
        }
      }
      
      if (event.imageUrl && !event.imageUrl.startsWith('data:')) {
        const imagePath = await downloadImage(
          event.imageUrl,
          'genshin-impact',
          event.name,
          'events',
          event.originalImageSrc
        );
        
        if (imagePath) {
          console.log(`  ✓ Downloaded`);
          event.localImage = imagePath;
        }
      }
    }

    console.log(`\nGenerating output files...`);

    const outputPath = path.join(__dirname, '..', 'src', 'data', 'scrapedGenshinEvents.js');
    const existingImageMap = await loadExistingImages(outputPath, 'scrapedGenshinEvents');

    const jsCode = `// scrapedGenshinEvents.js
// Auto-generated by scrapeGenshinCurrentUpcoming.js
// Last updated: ${new Date().toISOString()}

export const scrapedGenshinEvents = [
${filteredEvents.map(event => `  {
    title: '${event.name.replace(/'/g, "\\'")}',
    start: new Date('${new Date(event.startDate).toISOString()}'),
    end: new Date('${new Date(event.endDate).toISOString()}'),${event.isPermanent ? `\n    endNote: 'Permanent',` : ''}
    timezone: 'UTC+8',
    image: '${resolveImage(event.localImage, event.name, existingImageMap).replace(/'/g, "\\'")}',
    description: \`${event.description.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`,
    game: 'Genshin Impact',
  }`).join(',\n')}
];
`;

    fs.writeFileSync(outputPath, jsCode);

    console.log(`\n✅ Saved to: ${outputPath}`);
    console.log(`📊 Total: ${filteredEvents.length} events`);

    // Save JSON backup
    const jsonBackup = filteredEvents.map(event => ({
      title: event.name,
      start: new Date(event.startDate).toISOString(),
      end: new Date(event.endDate).toISOString(),
      endNote: event.isPermanent ? 'Permanent' : undefined,
      image: resolveImage(event.localImage, event.name, existingImageMap),
      description: event.description,
      game: 'Genshin Impact'
    }));
    const jsonPath = path.join(__dirname, '..', 'src', 'data', 'scrapedGenshinEvents.json');
    fs.writeFileSync(jsonPath, JSON.stringify(jsonBackup, null, 2));
    console.log(`💾 JSON backup: ${jsonPath}\n`);

    await browser.close();
  } catch (error) {
    console.error('Error:', error);
    await browser.close();
    process.exit(1);
  }
}

scrapeGenshinEvents();
