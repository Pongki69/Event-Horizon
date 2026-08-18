// scrapeGenshinHistory.js
// Optimized script to scrape Genshin Impact historical events
// Run with: node scripts/scrapeGenshinHistory.js

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

const CHECKPOINT_FILE = path.join(__dirname, '..', 'src', 'data', 'scraper-checkpoint.json');

console.log('🚀 Starting Genshin Impact Historical Events scraper...');

// Load checkpoint if exists
function loadCheckpoint() {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      const data = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
      console.log(`\n📂 Found checkpoint: ${data.allEvents.length} events already scraped`);
      console.log(`   Last completed: ${data.lastCompletedVersion || 'none'}\n`);
      return data;
    }
  } catch (error) {
    console.log('\n⚠️ Could not load checkpoint, starting fresh\n');
  }
  return { allEvents: [], lastCompletedVersion: null };
}

// Save checkpoint
function saveCheckpoint(allEvents, lastCompletedVersion) {
  try {
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify({
      allEvents,
      lastCompletedVersion,
      timestamp: new Date().toISOString()
    }, null, 2));
    console.log(`💾 Checkpoint saved: ${allEvents.length} events\n`);
  } catch (error) {
    console.log('⚠️ Could not save checkpoint\n');
  }
}

function parseWikiDate(dateStr) {
  if (!dateStr) return null;
  
  // Remove timezone indicators but keep the time
  dateStr = dateStr.replace(/GMT[+-]\d+/gi, '').replace(/UTC[+-]\d+/gi, '').replace(/\(Server Time\)/gi, '').trim();
  
  const months = {
    'january': 0, 'february': 1, 'march': 2, 'april': 3,
    'may': 4, 'june': 5, 'july': 6, 'august': 7,
    'september': 8, 'october': 9, 'november': 10, 'december': 11
  };
  
  // Try to extract time (HH:MM format)
  let hours = 10;
  let minutes = 0;
  const timeMatch = dateStr.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    hours = parseInt(timeMatch[1]);
    minutes = parseInt(timeMatch[2]);
  }
  
  // Match YYYY-MM-DD format
  let match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    const utcTime = Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), hours, minutes, 0);
    return utcTime;
  }
  
  // Match "Month DD, YYYY" format
  match = dateStr.match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/);
  if (match) {
    const [, monthName, day, year] = match;
    const month = months[monthName.toLowerCase()];
    if (month !== undefined) {
      const utcTime = Date.UTC(parseInt(year), month, parseInt(day), hours, minutes, 0);
      return utcTime;
    }
  }
  
  return null;
}

async function scrapeVersionPage(browser, url, versionName) {
  console.log(`${'='.repeat(80)}`);
  console.log(`📖 Scraping ${versionName}: ${url}`);
  console.log('='.repeat(80));
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    await loginToFandom(page);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Wait for tables to actually appear instead of fixed timer
    try {
      await page.waitForSelector('table.article-table', { timeout: 10000 });
      console.log('  ✅ Tables loaded');
    } catch (e) {
      console.log('  ⚠️ Tables not found, continuing anyway...');
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));

    const events = await page.evaluate(() => {
      const eventData = [];
      const tables = document.querySelectorAll('table.article-table');
      
      for (const table of tables) {
        const rows = table.querySelectorAll('tbody tr');
        
        for (const row of rows) {
          const cells = row.querySelectorAll('td');
          if (cells.length < 2) continue;
          
          const eventCell = cells[0];
          const links = eventCell.querySelectorAll('a');
          
          if (links.length === 0) continue;
          
          // Check if first link has text, otherwise use second link
          let titleLink = links[0];
          if (!titleLink.textContent.trim() && links.length > 1) {
            titleLink = links[1];
          }
          
          const title = titleLink.textContent.trim();
          const href = titleLink.getAttribute('href') || '';
          
          if (title && href) {
            eventData.push({
              title: title,
              href: href.startsWith('http') ? href : `https://genshin-impact.fandom.com${href}`
            });
          }
        }
      }
      
      return eventData;
    });

    console.log(`✅ Found ${events.length} events`);

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

    const processedEvents = [];
    
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      console.log(`[${i + 1}/${events.length}] ${event.title}`);
      console.log(`  🔗 ${event.href}`);
      
      try {
        await page.goto(event.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const eventDetails = await page.evaluate(() => {
          let startDate = '';
          let endDate = '';
          let description = '';
          
          const dateRows = document.querySelectorAll('tr');
          
          for (const row of dateRows) {
            const tds = row.querySelectorAll('td.pi-horizontal-group-item.pi-data-value.pi-font.pi-border-color.pi-item-spacing');
            
            if (tds.length >= 2) {
              const firstTd = tds[0].textContent.trim();
              const secondTd = tds[1].textContent.trim();
              
              if (firstTd.match(/\d{4}|january|february|march|april|may|june|july|august|september|october|november|december/i)) {
                startDate = firstTd;
                endDate = secondTd;
                break;
              }
            }
          }
          
          const descDiv = document.querySelector('div.description-content');
          if (descDiv) {
            description = descDiv.textContent.trim();
          } else {
            const eventCountdown = document.querySelector('div.eventcountdown.hidden');
            if (eventCountdown) {
              const nextP = eventCountdown.nextElementSibling;
              if (nextP && nextP.tagName === 'P') {
                description = nextP.textContent.trim();
              }
            }
            
            if (!description) {
              const firstP = document.querySelector('.mw-parser-output > p');
              if (firstP) {
                description = firstP.textContent.trim();
              }
            }
          }
          
          const img = document.querySelector('img.pi-image-thumbnail');
          const imageUrl = img && img.src ? img.src.split('/revision')[0] : null;
          
          return { startDate, endDate, description, imageUrl };
        });
        
        let startDate = null;
        let endDate = null;
        let endNote = null;
        
        if (eventDetails.startDate) {
          startDate = parseWikiDate(eventDetails.startDate);
        }
        
        if (eventDetails.endDate) {
          if (eventDetails.endDate.toLowerCase().includes('indefinite') || eventDetails.endDate.toLowerCase().includes('tba')) {
            endNote = 'Permanent';
            if (startDate) {
              endDate = startDate + (30 * 24 * 60 * 60 * 1000);
            }
          } else {
            endDate = parseWikiDate(eventDetails.endDate);
          }
        }
        
        if (!startDate || !endDate) {
          console.log(`  ⚠️ Skipping: invalid dates (start: ${eventDetails.startDate}, end: ${eventDetails.endDate})`);
          continue;
        }
        
        console.log(`  � Start: ${eventDetails.startDate} → ${new Date(startDate).toISOString()}`);
        console.log(`  📅 End: ${eventDetails.endDate} → ${new Date(endDate).toISOString()}`);
        console.log(`  �📝 Description: ${eventDetails.description ? eventDetails.description.substring(0, 100) + '...' : 'None'}`);        
        let localImage = '';
        if (eventDetails.imageUrl) {
          localImage = await downloadImage(eventDetails.imageUrl, 'genshin-impact', event.title, 'events', '');
          if (localImage) {
            console.log(`  ✅ Downloaded image`);
          }
        } else {
          console.log(`  ⚠️ No image found`);
        }
        
        const eventObj = {
          title: event.title,
          start: new Date(startDate).toISOString(),
          end: new Date(endDate).toISOString(),
          image: localImage || '',
          description: eventDetails.description || 'Historical event.',
          game: 'Genshin Impact',
          wikiUrl: event.href
        };
        
        if (endNote) {
          eventObj.endNote = endNote;
        }
        
        processedEvents.push(eventObj);
        console.log(`  ✅ Processed`);
        
      } catch (error) {
        console.log(`  ❌ Error: ${error.message}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    await page.close();
    return processedEvents;
    
  } catch (error) {
    console.error(`❌ Error scraping ${versionName}:`, error);
    await page.close();
    return [];
  }
}

async function scrapeAllVersions() {
  const versions = [
    { name: 'Version 1', url: 'https://genshin-impact.fandom.com/wiki/Event/History/Version_1' },
    { name: 'Version 2', url: 'https://genshin-impact.fandom.com/wiki/Event/History/Version_2' },
    { name: 'Version 3', url: 'https://genshin-impact.fandom.com/wiki/Event/History/Version_3' },
    { name: 'Version 4', url: 'https://genshin-impact.fandom.com/wiki/Event/History/Version_4' },
    { name: 'Version 5', url: 'https://genshin-impact.fandom.com/wiki/Event/History/Version_5' },
    { name: 'Song of the Welkin Moon', url: 'https://genshin-impact.fandom.com/wiki/Event/History/Song_of_the_Welkin_Moon' }
  ];

  // Load checkpoint
  const checkpoint = loadCheckpoint();
  let allEvents = checkpoint.allEvents;
  
  // Find where to resume
  let startIndex = 0;
  if (checkpoint.lastCompletedVersion) {
    startIndex = versions.findIndex(v => v.name === checkpoint.lastCompletedVersion) + 1;
    if (startIndex > 0) {
      console.log(`🔄 Resuming from ${versions[startIndex]?.name || 'end'}\n`);
    }
  }
  
  try {
    for (let i = startIndex; i < versions.length; i++) {
      const version = versions[i];
      console.log('🌐 Launching browser...');
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        protocolTimeout: 180000
      });
      
      try {
        const events = await scrapeVersionPage(browser, version.url, version.name);
        allEvents = allEvents.concat(events);
        console.log(`✅ ${version.name}: ${events.length} events collected\n`);
        
        // Save checkpoint after each version
        saveCheckpoint(allEvents, version.name);
      } catch (error) {
        console.error(`❌ Error scraping ${version.name}:`, error.message);
        console.log(`💾 Progress saved. Run script again to resume from ${version.name}\n`);
        saveCheckpoint(allEvents, i > 0 ? versions[i - 1].name : null);
        throw error; // Re-throw to stop execution
      } finally {
        await browser.close();
        console.log('🔒 Browser closed\n');
      }
    }

    console.log(`${'='.repeat(80)}`);
    console.log(`📊 TOTAL: ${allEvents.length} events`);
    console.log('='.repeat(80));

    const eventsCode = allEvents.map(event => {
      const endNoteField = event.endNote ? `    endNote: '${event.endNote}',` : '';
      return `  {
    title: '${event.title.replace(/'/g, "\\'")}',
    start: new Date('${event.start}'),
    end: new Date('${event.end}'),
    image: '${event.image}',
    description: \`${event.description.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`,
    game: '${event.game}',
    wikiUrl: '${event.wikiUrl}',${endNoteField}
  }`;
    }).join(',');

    const jsCode = `// scrapedGenshinHistoryEvents.js
// Auto-generated by scrapeGenshinHistory.js
// Last updated: ${new Date().toISOString()}

export const scrapedGenshinHistoryEvents = [
${eventsCode}
];
`;

    const outputPath = path.join(__dirname, '..', 'src', 'data', 'scrapedGenshinHistoryEvents.js');
    fs.writeFileSync(outputPath, jsCode);

    console.log(`✅ Saved to: ${outputPath}`);
    console.log(`📊 Total: ${allEvents.length} events`);

    const jsonBackup = allEvents.map(event => ({
      ...event,
      start: event.start,
      end: event.end
    }));
    const jsonPath = path.join(__dirname, '..', 'src', 'data', 'scrapedGenshinHistoryEvents.json');
    fs.writeFileSync(jsonPath, JSON.stringify(jsonBackup, null, 2));
    console.log(`💾 JSON backup: ${jsonPath}\n`);
    
    // Delete checkpoint file on successful completion
    if (fs.existsSync(CHECKPOINT_FILE)) {
      fs.unlinkSync(CHECKPOINT_FILE);
      console.log('🗑️ Checkpoint file deleted (scraping complete)\n');
    }
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

scrapeAllVersions();
