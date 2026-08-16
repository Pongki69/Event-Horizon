// scrapeWuwaCurrentUpcoming.js
// Scraper for Wuthering Waves current and upcoming events
// Run with: node scripts/scrapeWuwaCurrentUpcoming.js

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { downloadImage, loadExistingImages, resolveImage } from './archiveUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Starting Wuthering Waves Current/Upcoming Events scraper...');

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
 * Return date string with 04:00 AM time (Wuthering Waves daily reset time)
 */
function parseWuwaDate(dateStr) {
  // Format: "Month Day, Year" or "Mon Day, Year"
  const dateMatch = dateStr.match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/);
  
  if (dateMatch) {
    const [, monthName, day, year] = dateMatch;
    const month = monthToIndex(monthName);
    
    // Return ISO date string with 04:00 AM time: YYYY-MM-DDTHH:MM:SS
    const monthStr = String(month + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    return `${year}-${monthStr}-${dayStr}T04:00:00`;
  }
  
  return null;
}

async function scrapeWuwaCurrentUpcoming() {
  console.log('Fetching current and upcoming events from Game8...');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    // Navigate to events page
    await page.goto('https://game8.co/games/Wuthering-Waves/archives/453473', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    console.log('Page loaded, extracting current and upcoming events...');
    
    // Wait for content to load
    await page.waitForSelector('body', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Extract events from "Ongoing Events" and "Upcoming Events" sections
    const allEvents = await page.evaluate(() => {
      const events = [];
      
      // Find both "Ongoing Events" and "Upcoming Events" h3 elements
      const h3Elements = document.querySelectorAll('h3');
      const sectionsToScrape = ['Ongoing Events', 'Upcoming Events', 'Permanent Events'];
      
      for (const sectionName of sectionsToScrape) {
        let sectionH3 = null;
        
        for (const h3 of h3Elements) {
          if (h3.textContent.trim() === sectionName) {
            sectionH3 = h3;
            break;
          }
        }
        
        if (!sectionH3) {
          console.log(`${sectionName} section not found`);
          continue;
        }
        
        console.log(`Found ${sectionName} section`);
        
        // Find the table after this h3
        let element = sectionH3.nextElementSibling;
        let table = null;
        
        while (element) {
          if (element.tagName === 'H3') {
            break; // Stop at next h3
          }
          
          if (element.tagName === 'TABLE' && element.classList.contains('a-table')) {
            table = element;
            break;
          }
          
          element = element.nextElementSibling;
        }
        
        if (!table) {
          console.log(`No table found for ${sectionName}`);
          continue;
        }
        
        console.log(`Found table for ${sectionName}`);
        
        // Process table rows
        const rows = table.querySelectorAll('tr');
        console.log(`Found ${rows.length} rows (including header)`);
        
        for (let i = 1; i < rows.length; i++) { // Skip header row
          const row = rows[i];
          const cells = row.querySelectorAll('td');
          
          if (cells.length < 2) continue;
          
          // First cell: Event name and image
          const nameCell = cells[0];
          const nameLink = nameCell.querySelector('a');
          const img = nameCell.querySelector('img');
          
          let eventName = '';
          let eventHref = '';
          
          if (nameLink) {
            eventName = nameLink.textContent.trim();
            eventHref = nameLink.getAttribute('href') || '';
          } else {
            // Fallback: get all text from first column
            eventName = nameCell.textContent.trim();
            console.log(`  No link found, using text: "${eventName}"`);
          }
          
          if (!eventName) continue;
          
          const imageUrl = img ? (img.getAttribute('data-src') || img.getAttribute('src') || '') : '';
          
          // Second cell: Event date
          const dateCell = cells[1];
          let dateText = dateCell.textContent.trim();
          
          // Extract only the date portion (before any newlines or extra text)
          // Format: "Month Day, Year - Month Day, Year" or "Month Day, Year - Permanent"
          const dateOnlyMatch = dateText.match(/([A-Za-z]+\s+\d{1,2},\s+\d{4}\s*-\s*(?:[A-Za-z]+\s+\d{1,2},\s+\d{4}|Permanent))/);
          if (dateOnlyMatch) {
            dateText = dateOnlyMatch[1].trim();
          }
          
          console.log(`Row ${i}: Found event "${eventName}" with date "${dateText}"`);
          
          events.push({
            name: eventName,
            href: eventHref,
            imageUrl: imageUrl,
            dateText: dateText
          });
        }
      }
      
      return events;
    });

    console.log(`Found ${allEvents.length} ongoing and upcoming events`);

    // Process each event
    const processedEvents = [];
    
    for (const event of allEvents) {
      console.log(`\n  Event: ${event.name}`);
      console.log(`    Date text: ${event.dateText}`);
      
      // If no href, we can't get description from detail page
      if (!event.href) {
        console.log(`    ⚠ No href found, will use fallback description`);
      }
      
      // Build full URL if href exists
      let fullUrl = '';
      if (event.href) {
        fullUrl = event.href.startsWith('http') 
          ? event.href 
          : `https://game8.co${event.href}`;
        console.log(`    Fetching details from: ${fullUrl}`);
      }
      
      try {
        let eventDetails = { description: '', imageUrl: '' };
        
        // Only fetch detail page if href exists
        if (fullUrl) {
          const eventPage = await browser.newPage();
          await eventPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
          
          await eventPage.goto(fullUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
          });
          
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Extract description and image from detail page
          eventDetails = await eventPage.evaluate(() => {
          let description = '';
          let imageUrl = '';
          
          // Find the image with width="728"
          const images = document.querySelectorAll('img[width="728"]');
          
          if (images.length > 0) {
            const targetImage = images[0];
            
            // Get the image URL
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
          
          // Fallback: get first meaningful paragraph
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
          
          return { description, imageUrl };
        });
        
        await eventPage.close();
      }
        
        // Parse dates from dateText
        // Format examples: "February 13, 2025, to March 26, 2025"
        //                  "February 13, 2025 - March 26, 2025"
        //                  "February 13, 2025, to Permanent"
        const dateMatch = event.dateText.match(/([A-Za-z]+\s+\d{1,2},\s+\d{4})[,\s]*(?:to|-)\s*([A-Za-z]+\s+\d{1,2},\s+\d{4}|Permanent)/i);
        
        if (!dateMatch) {
          console.log(`    ✗ Could not parse date format: ${event.dateText}`);
          continue;
        }
        
        const startDateStr = dateMatch[1];
        const endDateStr = dateMatch[2];
        
        const startDate = parseWuwaDate(startDateStr);
        
        let endDate;
        let isPermanent = false;
        
        if (endDateStr.toLowerCase() === 'permanent') {
          // For permanent events, set end date to 30 days from start for calendar display
          isPermanent = true;
          const startDateObj = new Date(startDate);
          startDateObj.setDate(startDateObj.getDate() + 30);
          endDate = startDateObj.toISOString().split('T')[0] + 'T04:00:00';
          console.log(`    ℹ Event is permanent, setting 30-day calendar display`);
        } else {
          endDate = parseWuwaDate(endDateStr);
        }
        
        if (!startDate || !endDate) {
          console.log(`    ✗ Failed to parse dates`);
          continue;
        }
        
        console.log(`    Event Start: ${startDateStr}`);
        console.log(`    Event End: ${endDateStr}${isPermanent ? ' (permanent)' : ''}`);
        
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
          
          // Remove query parameters
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
          start: startDate,
          end: endDate,
          endNote: isPermanent ? 'Permanent' : '',
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

    await browser.close();

    console.log(`\n\nProcessed ${processedEvents.length} current/upcoming events`);

    // Generate JavaScript code
    const eventsCode = processedEvents.map(event => {
      return `  {
    title: '${event.title.replace(/'/g, "\\'")}',
    start: new Date('${event.start}'),
    end: new Date('${event.end}'),${event.endNote ? `\n    endNote: '${event.endNote}',` : ''}
    image: '${event.image}',
    description: \`${event.description.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`,
    game: '${event.game}',
  }`;
    }).join(',\n');

    const jsCode = `// scrapedWuwaEvents.js
// Auto-generated by scrapeWuwaCurrentUpcoming.js
// Last updated: ${new Date().toISOString()}

export const scrapedWuwaEvents = [
${eventsCode}
];
`;

    // Write to file
    const outputPath = path.join(__dirname, '..', 'src', 'data', 'scrapedWuwaEvents.js');
    const existingImageMap = await loadExistingImages(outputPath, 'scrapedWuwaEvents');

    // Apply image fallback before writing
    const resolvedEvents = processedEvents.map(event => ({
      ...event,
      image: resolveImage(event.image, event.title, existingImageMap),
    }));

    const eventsCodeResolved = resolvedEvents.map(event => {
      return `  {
    title: '${event.title.replace(/'/g, "\\'")}',
    start: new Date('${event.start}'),
    end: new Date('${event.end}'),${event.endNote ? `\n    endNote: '${event.endNote}',` : ''}
    image: '${event.image.replace(/'/g, "\\'")}',
    description: \`${event.description.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`,
    game: '${event.game}',
  }`;
    }).join(',\n');

    const jsCodeResolved = `// scrapedWuwaEvents.js
// Auto-generated by scrapeWuwaCurrentUpcoming.js
// Last updated: ${new Date().toISOString()}

export const scrapedWuwaEvents = [
${eventsCodeResolved}
];
`;

    fs.writeFileSync(outputPath, jsCodeResolved);

    console.log(`\n✅ Current/upcoming events saved to: ${outputPath}`);
    console.log(`📊 Total events: ${processedEvents.length}`);
    
    // Also write to history file (merge with existing)
    const historyOutputPath = path.join(__dirname, '..', 'src', 'data', 'scrapedWuwaHistoryEvents.js');
    let existingHistoryEvents = [];
    
    // Try to read existing history file
    try {
      const { scrapedWuwaHistoryEvents } = await import(`file://${historyOutputPath}?t=${Date.now()}`);
      existingHistoryEvents = scrapedWuwaHistoryEvents || [];
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
    processedEvents.forEach(event => {
      const key = `${event.title}|||${event.start}`;
      eventsMap.set(key, event);
    });
    
    // Remove duplicate events where one is a substring of another with same start date
    // Keep only the longer, more specific title
    const mergedEventsArray = Array.from(eventsMap.values());
    const keysToRemove = new Set();
    
    for (let i = 0; i < mergedEventsArray.length; i++) {
      for (let j = i + 1; j < mergedEventsArray.length; j++) {
        const event1 = mergedEventsArray[i];
        const event2 = mergedEventsArray[j];
        
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
    
    const historyJsCode = `// scrapedWuwaHistoryEvents.js
// Auto-generated by scrapeWuwaCurrentUpcoming.js
// Last updated: ${new Date().toISOString()}

export const scrapedWuwaHistoryEvents = [
${mergedEvents.map(event => `  {
    title: '${event.title.replace(/'/g, "\\'")}',
    start: new Date('${event.start}'),
    end: new Date('${event.end}'),
    image: '${event.image}',
    description: \`${event.description.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`,
    game: 'Wuthering Waves',
  }`).join(',\n')}
];
`;

    fs.writeFileSync(historyOutputPath, historyJsCode);

    console.log(`✅ Events also saved to: ${historyOutputPath}`);
    console.log(`📊 Total history events: ${mergedEvents.length} (${mergedEvents.length - existingHistoryEvents.length} new)\n`);
    
    // Save JSON backup
    const jsonBackup = mergedEvents.map(event => ({
      title: event.title,
      start: new Date(event.start).toISOString(),
      end: new Date(event.end).toISOString(),
      endNote: event.endNote,
      image: event.image || '',
      description: event.description || '',
      game: 'Wuthering Waves',
      wikiUrl: event.wikiUrl || ''
    }));
    const jsonPath = path.join(__dirname, '..', 'src', 'data', 'scrapedWuwaHistoryEvents.json');
    fs.writeFileSync(jsonPath, JSON.stringify(jsonBackup, null, 2));
    console.log(`💾 JSON backup saved to: ${jsonPath}\n`);

  } catch (error) {
    console.error('Error during scraping:', error);
    await browser.close();
    process.exit(1);
  }
}

scrapeWuwaCurrentUpcoming();
