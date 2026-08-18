// scrapeWuwaHistory.js
// One-time script to scrape Wuthering Waves historical events
// Run with: node scripts/scrapeWuwaHistory.js

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { downloadImage } from './archiveUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Starting Wuthering Waves Historical Events scraper...');

// Version release dates mapping (each version ends when the next one starts)
const versionDates = {
  '1.0': { start: 'May 23, 2024', end: 'June 28, 2024' },
  '1.1': { start: 'June 28, 2024', end: 'August 15, 2024' },
  '1.2': { start: 'August 15, 2024', end: 'September 29, 2024' },
  '1.3': { start: 'September 29, 2024', end: 'November 14, 2024' },
  '1.4': { start: 'November 14, 2024', end: 'January 2, 2025' },
  '2.0': { start: 'January 2, 2025', end: 'February 13, 2025' },
  '2.1': { start: 'February 13, 2025', end: 'March 27, 2025' },
  '2.2': { start: 'March 27, 2025', end: 'April 29, 2025' },
  '2.3': { start: 'April 29, 2025', end: 'June 12, 2025' },
  '2.4': { start: 'June 12, 2025', end: 'July 24, 2025' },
  '2.5': { start: 'July 24, 2025', end: 'August 28, 2025' },
  '2.6': { start: 'August 28, 2025', end: 'October 9, 2025' },
  '2.7': { start: 'October 9, 2025', end: 'November 20, 2025' },
  '2.8': { start: 'November 20, 2025', end: 'December 25, 2025' },
  '3.0': { start: 'December 25, 2025', end: 'February 5, 2026' },
  '3.1': { start: 'February 5, 2026', end: 'March 19, 2026' }
};

/**
 * Get version end date based on version number
 */
function getVersionEndDate(versionText) {
  // Extract version number from text like "Version 2.4" or "2.4"
  const versionMatch = versionText.match(/(\d+\.\d+)/);
  if (versionMatch) {
    const version = versionMatch[1];
    return versionDates[version]?.end || null;
  }
  return null;
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
 * Parse date format from event page
 * Wuthering Waves uses UTC+8 time with daily reset at 04:00 AM
 */
function parseWuwaDate(dateStr) {
  // Format: "Month Day, Year" or "Mon Day, Year"
  const dateMatch = dateStr.match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/);
  
  if (dateMatch) {
    const [, monthName, day, year] = dateMatch;
    const month = monthToIndex(monthName);
    
    // Events reset at 04:00 AM UTC+8 = 20:00 UTC previous day
    return Date.UTC(parseInt(year), month, parseInt(day) - 1, 20, 0, 0);
  }
  
  return null;
}

async function scrapeWuwaHistory() {
  console.log('Fetching historical events from Game8...');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    // Navigate to history page
    await page.goto('https://game8.co/games/Wuthering-Waves/archives/453473', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    console.log('Page loaded, extracting historical events...');
    
    // Wait for content to load
    await page.waitForSelector('body', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Extract events from the page
    const eventsByVersion = await page.evaluate(() => {
      const versionData = [];
      
      // Find all h3 elements that contain "List of X.X Events"
      const h3Elements = document.querySelectorAll('h3');
      
      for (const h3 of h3Elements) {
        const h3Text = h3.textContent.trim();
        
        // Check if it matches "List of X.X Events" pattern
        if (h3Text.match(/List of \d+\.\d+ Events/)) {
          console.log(`Found version section: ${h3Text}`);
          
          // Find ALL tables after this h3 until the next h3
          const tables = [];
          let element = h3.nextElementSibling;
          
          while (element) {
            // Stop if we hit another h3
            if (element.tagName === 'H3') {
              break;
            }
            
            // Collect all tables with class "a-table"
            if (element.tagName === 'TABLE' && element.classList.contains('a-table')) {
              tables.push(element);
            }
            
            element = element.nextElementSibling;
          }
          
          if (tables.length === 0) {
            console.log(`  No tables found for ${h3Text}`);
            continue;
          }
          
          console.log(`  Found ${tables.length} table(s) for ${h3Text}`);
          
          // Process all tables for this version
          const events = [];
          
          for (let tableIndex = 0; tableIndex < tables.length; tableIndex++) {
            const table = tables[tableIndex];
            const rows = table.querySelectorAll('tr');
            console.log(`    Table ${tableIndex + 1}: Found ${rows.length} rows (including header)`);
            
            for (let i = 1; i < rows.length; i++) { // Skip header row
              const row = rows[i];
              const cells = row.querySelectorAll('td');
              
              console.log(`      Row ${i}: Found ${cells.length} cells (events)`);
              
              // Each cell contains one event (image + link)
              for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
                const cell = cells[cellIndex];
                
                // Look for the FIRST image in this cell only
                const images = cell.querySelectorAll('img');
                const img = images.length > 0 ? images[0] : null;
                const imageUrl = img ? (img.getAttribute('data-src') || img.getAttribute('src') || '') : '';
                
                // Look for link in this cell
                const nameLink = cell.querySelector('a');
                if (!nameLink) {
                  console.log(`        Cell ${cellIndex}: Skipped (no <a> tag found)`);
                  continue;
                }
                
                const eventName = nameLink.textContent.trim();
                const eventHref = nameLink.getAttribute('href') || '';
                
                if (!eventName) {
                  console.log(`        Cell ${cellIndex}: Skipped (empty event name)`);
                  continue;
                }
                
                console.log(`        Cell ${cellIndex}: Found event "${eventName}"`);
                
                events.push({
                  name: eventName,
                  href: eventHref,
                  imageUrl: imageUrl
                });
              }
            }
          }
          
          versionData.push({
            version: h3Text,
            events: events
          });
        }
      }
      
      return versionData;
    });

    console.log(`Found ${eventsByVersion.length} version sections`);
    
    // Flatten and deduplicate all events
    let allEvents = [];
    eventsByVersion.forEach(v => {
      console.log(`  ${v.version}: ${v.events.length} events`);
      allEvents = allEvents.concat(v.events.map(e => ({ ...e, version: v.version })));
    });
    
    // Deduplicate events based on name and href
    const seenEvents = new Map();
    const uniqueEvents = [];
    
    for (const event of allEvents) {
      const eventKey = `${event.name}::${event.href}`;
      
      if (seenEvents.has(eventKey)) {
        console.log(`  ⚠️  Duplicate detected: "${event.name}" - skipping`);
        continue;
      }
      
      seenEvents.set(eventKey, event);
      uniqueEvents.push(event);
    }
    
    console.log(`After deduplication: ${uniqueEvents.length} unique events`);
    
    // Regroup by version
    const deduplicatedByVersion = [];
    const versionMap = new Map();
    
    for (const event of uniqueEvents) {
      if (!versionMap.has(event.version)) {
        versionMap.set(event.version, { version: event.version, events: [] });
        deduplicatedByVersion.push(versionMap.get(event.version));
      }
      versionMap.get(event.version).events.push(event);
    }
    
    let totalEvents = uniqueEvents.length;
    console.log(`Total events to process: ${totalEvents}`);

    // Process each event
    const processedEvents = [];
    
    for (const versionSection of deduplicatedByVersion) {
      console.log(`\nProcessing ${versionSection.version}...`);
      
      for (const event of versionSection.events) {
        console.log(`\n  Event: ${event.name}`);
        
        if (!event.href) {
          console.log(`    ✗ No href found, skipping`);
          continue;
        }
        
        // Build full URL
        const fullUrl = event.href.startsWith('http') 
          ? event.href 
          : `https://game8.co${event.href}`;
        
        console.log(`    Fetching details from: ${fullUrl}`);
        
        try {
          const eventPage = await browser.newPage();
          await eventPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
          
          await eventPage.goto(fullUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
          });
          
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Extract event start and end dates, description, and image
          const eventDetails = await eventPage.evaluate(() => {
            let startDate = '';
            let endDate = '';
            let versionInfo = '';
            let description = '';
            let imageUrl = '';
            
            // Find "Event Start" and "Event End" text
            const allText = document.body.innerText;
            
            // Look for "Event Start" pattern
            const startMatch = allText.match(/Event Start[:\s]*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
            if (startMatch) {
              startDate = startMatch[1];
            }
            
            // Look for "Event End" pattern
            let endMatch = allText.match(/Event End[:\s]*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
            if (endMatch) {
              endDate = endMatch[1];
            }
            
            // If no Event End found, try to find Version info
            if (!endDate) {
              const versionMatch = allText.match(/Version[:\s]*(\d+\.\d+)/i);
              if (versionMatch) {
                versionInfo = versionMatch[1];
              }
            }
            
            // Find the image with width="728"
            const images = document.querySelectorAll('img[width="728"]');
            
            if (images.length > 0) {
              const targetImage = images[0];
              
              // Get the image URL from the detail page
              imageUrl = targetImage.getAttribute('data-src') || targetImage.getAttribute('src') || '';
              
              // Get the parent element and look for the next <p> tag
              let currentElement = targetImage.parentElement;
              
              // Traverse siblings to find the next <p> tag
              let nextElement = currentElement.nextElementSibling;
              
              while (nextElement) {
                if (nextElement.tagName === 'P') {
                  const text = nextElement.textContent.trim();
                  const hasLetters = /[a-zA-Z]/.test(text);
                  
                  if (hasLetters && text.length > 20 && 
                      !text.includes('Game8') && 
                      !text.includes('Copyright') && 
                      !text.includes('Want more information') &&
                      !text.includes('Learn more')) {
                    description = text;
                    break;
                  }
                }
                
                // Also check inside divs for <p> tags
                if (nextElement.tagName === 'DIV') {
                  const p = nextElement.querySelector('p');
                  if (p) {
                    const text = p.textContent.trim();
                    const hasLetters = /[a-zA-Z]/.test(text);
                    
                    if (hasLetters && text.length > 20 && 
                        !text.includes('Game8') && 
                        !text.includes('Copyright') && 
                        !text.includes('Want more information') &&
                        !text.includes('Learn more')) {
                      description = text;
                      break;
                    }
                  }
                }
                
                nextElement = nextElement.nextElementSibling;
              }
            }
            
            // Fallback: get first meaningful paragraph with letters
            if (!description) {
              const paragraphs = document.querySelectorAll('p');
              for (const p of paragraphs) {
                const text = p.textContent.trim();
                const hasLetters = /[a-zA-Z]/.test(text);
                
                if (hasLetters && text.length > 50 && 
                    !text.includes('Game8') && 
                    !text.includes('Copyright') && 
                    !text.includes('Want more information') &&
                    !text.includes('Learn more')) {
                  description = text;
                  break;
                }
              }
            }
            
            return { startDate, endDate, versionInfo, description, imageUrl };
          });
          
          await eventPage.close();
          
          // If no end date but we have version info, use version end date
          if (!eventDetails.endDate && eventDetails.versionInfo) {
            const versionEndDate = getVersionEndDate(eventDetails.versionInfo);
            if (versionEndDate) {
              eventDetails.endDate = versionEndDate;
              console.log(`    ℹ Using version ${eventDetails.versionInfo} end date: ${versionEndDate}`);
            }
          }
          
          if (!eventDetails.startDate || !eventDetails.endDate) {
            console.log(`    ✗ Could not find Event Start or Event End dates`);
            console.log(`       Found Start: ${eventDetails.startDate || 'none'}`);
            console.log(`       Found End: ${eventDetails.endDate || 'none'}`);
            console.log(`       Found Version: ${eventDetails.versionInfo || 'none'}`);
            continue;
          }
          
          console.log(`    Event Start: ${eventDetails.startDate}`);
          console.log(`    Event End: ${eventDetails.endDate}`);
          
          // Parse dates
          const startDate = parseWuwaDate(eventDetails.startDate);
          const endDate = parseWuwaDate(eventDetails.endDate);
          
          if (!startDate || !endDate) {
            console.log(`    ✗ Failed to parse dates`);
            continue;
          }
          
          // Download image from detail page (preferred) or fallback to table image
          let localImage = '';
          let imageUrlToDownload = eventDetails.imageUrl || event.imageUrl;
          
          if (imageUrlToDownload && !imageUrlToDownload.startsWith('data:')) {
            let fullImageUrl = imageUrlToDownload;
            
            // Convert relative URLs to absolute
            if (fullImageUrl.startsWith('//')) {
              fullImageUrl = 'https:' + fullImageUrl;
            } else if (fullImageUrl.startsWith('/')) {
              fullImageUrl = 'https://game8.co' + fullImageUrl;
            }
            
            // Remove query parameters for cleaner URLs
            fullImageUrl = fullImageUrl.split('?')[0];
            
            console.log(`    Downloading image from detail page...`);
            localImage = await downloadImage(
              fullImageUrl,
              'wuthering-waves',
              event.name,
              'events'
            );
            
            if (localImage) {
              console.log(`    ✓ Image saved: ${localImage}`);
            }
          } else {
            console.log(`    ⚠ No image available`);
          }
          
          // Use description or fallback
          const description = eventDetails.description || 'Click the photo to see the event description';
          
          if (eventDetails.description) {
            console.log(`    ✓ Description: "${description.substring(0, 100)}..."`);
          } else {
            console.log(`    ⚠ No description found, using fallback`);
          }
          
          processedEvents.push({
            title: event.name,
            start: new Date(startDate).toISOString(),
            end: new Date(endDate).toISOString(),
            image: localImage || '',
            description: description,
            game: 'Wuthering Waves'
          });
          
          console.log(`    ✓ Event processed successfully`);
          
        } catch (error) {
          console.log(`    ✗ Error processing event: ${error.message}`);
        }
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    await browser.close();

    console.log(`\n\nProcessed ${processedEvents.length} historical events`);

    // Generate JavaScript code
    const eventsCode = processedEvents.map(event => {
      return `  {
    title: '${event.title.replace(/'/g, "\\'")}',
    start: new Date('${event.start}'),
    end: new Date('${event.end}'),
    image: '${event.image}',
    description: \`${event.description.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`,
    game: '${event.game}',
  }`;
    }).join(',\n');

    const jsCode = `// scrapedWuwaHistoryEvents.js
// Auto-generated by scrapeWuwaHistory.js
// Last updated: ${new Date().toISOString()}

export const scrapedWuwaHistoryEvents = [
${eventsCode}
];
`;

    // Write to file
    const outputPath = path.join(__dirname, '..', 'src', 'data', 'scrapedWuwaHistoryEvents.js');
    fs.writeFileSync(outputPath, jsCode);

    console.log(`\n✅ Historical events saved to: ${outputPath}`);
    console.log(`📊 Total events: ${processedEvents.length}`);

  } catch (error) {
    console.error('Error during scraping:', error);
    await browser.close();
    process.exit(1);
  }
}

scrapeWuwaHistory();
