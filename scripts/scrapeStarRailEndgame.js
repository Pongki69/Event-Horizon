// scrapeStarRailEndgame.js
// Script to scrape Honkai Star Rail endgame content from wiki
// Run with: node scripts/scrapeStarRailEndgame.js

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { downloadImage } from './archiveUtils.js';
import { loginToFandom } from './fandomLogin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Extract title from wiki URL and format it
 * Example: "https://...wiki/Pure_Fiction" -> "Pure Fiction"
 * Example: "https://...wiki/Divergent_Universe:_Protean_Hero" -> "Divergent Universe: Protean Hero"
 */
function extractTitleFromUrl(url) {
  try {
    // Get the part after /wiki/
    const match = url.match(/\/wiki\/(.+)$/);
    if (!match) return null;
    
    let title = match[1];
    
    // Replace underscores with spaces
    title = title.replace(/_/g, ' ');
    
    // Decode URL encoding (e.g., %20 -> space)
    title = decodeURIComponent(title);
    
    return title;
  } catch (error) {
    console.error('Error extracting title from URL:', error);
    return null;
  }
}

/**
 * Parse wiki date format to ISO string (Asia time UTC+8)
 */
function parseWikiDate(dateStr) {
  // Format: "February 16, 2026 04:00" or "2026/02/16 04:00" or "March 30, 2026 04:00:00 AM" or "30 February, 2026 06:00 AM"
  try {
    // Try format: "March 30, 2026 04:00:00 AM"
    const match1 = dateStr.match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s+([AP]M)/);
    if (match1) {
      const [, month, day, year, hour, minute, second, ampm] = match1;
      const monthMap = {
        'January': 0, 'February': 1, 'March': 2, 'April': 3, 'May': 4, 'June': 5,
        'July': 6, 'August': 7, 'September': 8, 'October': 9, 'November': 10, 'December': 11
      };
      let hourNum = parseInt(hour);
      if (ampm === 'PM' && hourNum !== 12) hourNum += 12;
      if (ampm === 'AM' && hourNum === 12) hourNum = 0;
      
      const date = new Date(parseInt(year), monthMap[month], parseInt(day), hourNum, parseInt(minute), parseInt(second));
      return date.toISOString();
    }
    
    // Try format: "30 February, 2026 06:00 AM" (day first)
    const match2 = dateStr.match(/(\d{1,2})\s+([A-Za-z]+),\s+(\d{4})\s+(\d{1,2}):(\d{2})\s+([AP]M)/);
    if (match2) {
      const [, day, month, year, hour, minute, ampm] = match2;
      const monthMap = {
        'January': 0, 'February': 1, 'March': 2, 'April': 3, 'May': 4, 'June': 5,
        'July': 6, 'August': 7, 'September': 8, 'October': 9, 'November': 10, 'December': 11
      };
      let hourNum = parseInt(hour);
      if (ampm === 'PM' && hourNum !== 12) hourNum += 12;
      if (ampm === 'AM' && hourNum === 12) hourNum = 0;
      
      const date = new Date(parseInt(year), monthMap[month], parseInt(day), hourNum, parseInt(minute), 0);
      return date.toISOString();
    }
    
    // Try format: "26 February, 2025 06:00" (day first, no AM/PM, assume 24h format)
    const match2b = dateStr.match(/(\d{1,2})\s+([A-Za-z]+),\s+(\d{4})\s+(\d{1,2}):(\d{2})$/);
    if (match2b) {
      const [, day, month, year, hour, minute] = match2b;
      const monthMap = {
        'January': 0, 'February': 1, 'March': 2, 'April': 3, 'May': 4, 'June': 5,
        'July': 6, 'August': 7, 'September': 8, 'October': 9, 'November': 10, 'December': 11
      };
      
      const date = new Date(parseInt(year), monthMap[month], parseInt(day), parseInt(hour), parseInt(minute), 0);
      return date.toISOString();
    }
    
    // Try format: "February 16, 2026 04:00"
    const match3 = dateStr.match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2})/);
    if (match3) {
      const [, month, day, year, hour, minute] = match3;
      const monthMap = {
        'January': 0, 'February': 1, 'March': 2, 'April': 3, 'May': 4, 'June': 5,
        'July': 6, 'August': 7, 'September': 8, 'October': 9, 'November': 10, 'December': 11
      };
      const date = new Date(parseInt(year), monthMap[month], parseInt(day), parseInt(hour), parseInt(minute), 0);
      return date.toISOString();
    }
    
    // Try format: "2026/02/16 04:00"
    const match4 = dateStr.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/);
    if (match4) {
      const [, year, month, day, hour, minute] = match4;
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute), 0);
      return date.toISOString();
    }
    
    return null;
  } catch (error) {
    console.error(`Error parsing date: ${dateStr}`, error);
    return null;
  }
}

async function scrapeStarRailEndgame() {
  console.log('Starting Honkai Star Rail endgame content scraping...');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const events = [];

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    await loginToFandom(page);

    // ===== PURE FICTION =====
    console.log('\n=== Scraping Pure Fiction ===');
    try {
      // Get duration from Stages page
      await page.goto('https://honkai-star-rail.fandom.com/wiki/Pure_Fiction/Stages', {
        waitUntil: 'networkidle2',
        timeout: 60000
      });
      
      const pureFictionData = await page.evaluate(() => {
        let startDate = '';
        let endDate = '';
        
        // Look for the table with class "wikitable"
        const tables = document.querySelectorAll('table.wikitable');
        
        for (const table of tables) {
          const rows = table.querySelectorAll('tr');
          
          for (const row of rows) {
            const cells = row.querySelectorAll('td');
            
            // Look for cell with "Start:" and "End:" in bold tags
            for (const cell of cells) {
              const html = cell.innerHTML;
              
              if (html.includes('<b>Start:</b>') && html.includes('<b>End:</b>')) {
                // Extract dates using regex
                const startMatch = html.match(/<b>Start:<\/b>\s*([A-Za-z]+\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}:\d{2}\s+[AP]M)/i);
                const endMatch = html.match(/<b>End:<\/b>\s*([A-Za-z]+\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}:\d{2}\s+[AP]M)/i);
                
                if (startMatch) startDate = startMatch[1];
                if (endMatch) endDate = endMatch[1];
                
                if (startDate && endDate) break;
              }
            }
            
            if (startDate && endDate) break;
          }
          
          if (startDate && endDate) break;
        }
        
        return { startDate, endDate };
      });
      
      console.log('Pure Fiction dates:', pureFictionData);
      
      if (pureFictionData.startDate && pureFictionData.endDate) {
        const startTime = parseWikiDate(pureFictionData.startDate);
        const endTime = parseWikiDate(pureFictionData.endDate);
        
        if (startTime && endTime) {
          const wikiUrl = 'https://honkai-star-rail.fandom.com/wiki/Pure_Fiction';
          const title = extractTitleFromUrl(wikiUrl) || 'Pure Fiction';
          
          events.push({
            title: title,
            start: startTime,
            end: endTime,
            game: 'Honkai: Star Rail',
            image: '/images/honkai-star-rail/events/pure-fiction.webp',
            description: '"People often hold the belief that a document produced by a photocopier faithfully replicates its original, and they tend to trust that a story narrated by a parrot reflects truth." — Hellerdon, ██ Historian',
            wikiUrl: wikiUrl
          });
          console.log(`✓ Pure Fiction: ${pureFictionData.startDate} - ${pureFictionData.endDate}`);
        }
      }
    } catch (error) {
      console.error('✗ Failed to scrape Pure Fiction:', error.message);
    }

    // ===== MEMORY OF CHAOS =====
    console.log('\n=== Scraping Memory of Chaos ===');
    try {
      await page.goto('https://honkai-star-rail.fandom.com/wiki/Forgotten_Hall/Stages', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      
      const memoryOfChaosData = await page.evaluate(() => {
        let startDate = '';
        let endDate = '';
        
        // Find h2 with "Memory of Chaos"
        const headers = document.querySelectorAll('h2');
        
        for (const header of headers) {
          if (header.textContent.includes('Memory of Chaos')) {
            // Find the next table after this header
            let element = header.nextElementSibling;
            while (element) {
              if (element.tagName === 'TABLE') {
                // Look for cells with Start and End dates
                const cells = element.querySelectorAll('td');
                
                for (const cell of cells) {
                  const html = cell.innerHTML;
                  
                  if (html.includes('<b>Start:</b>') && html.includes('<b>End:</b>')) {
                    const startMatch = html.match(/<b>Start:<\/b>\s*([A-Za-z]+\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}:\d{2}\s+[AP]M)/i);
                    const endMatch = html.match(/<b>End:<\/b>\s*([A-Za-z]+\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}:\d{2}\s+[AP]M)/i);
                    
                    if (startMatch) startDate = startMatch[1];
                    if (endMatch) endDate = endMatch[1];
                    
                    if (startDate && endDate) break;
                  }
                }
                
                if (startDate && endDate) break;
              }
              element = element.nextElementSibling;
            }
            
            if (startDate && endDate) break;
          }
        }
        
        return { startDate, endDate };
      });
      
      if (memoryOfChaosData.startDate && memoryOfChaosData.endDate) {
        const startTime = parseWikiDate(memoryOfChaosData.startDate);
        const endTime = parseWikiDate(memoryOfChaosData.endDate);
        
        if (startTime && endTime) {
          const wikiUrl = 'https://honkai-star-rail.fandom.com/wiki/Memory_of_Chaos';
          const title = extractTitleFromUrl(wikiUrl) || 'Memory of Chaos';
          
          events.push({
            title: title,
            start: startTime,
            end: endTime,
            game: 'Honkai: Star Rail',
            image: '/images/honkai-star-rail/events/memory-of-chaos.webp',
            description: 'Memory of Chaos is a recurring endgame challenge. Complete stages to earn Stellar Jades and other rewards.',
            wikiUrl: wikiUrl
          });
          console.log(`✓ Memory of Chaos: ${memoryOfChaosData.startDate} - ${memoryOfChaosData.endDate}`);
        }
      }
    } catch (error) {
      console.error('✗ Failed to scrape Memory of Chaos:', error.message);
    }

    // ===== APOCALYPTIC SHADOW =====
    console.log('\n=== Scraping Apocalyptic Shadow ===');
    try {
      await page.goto('https://honkai-star-rail.fandom.com/wiki/Apocalyptic_Shadow/Stages', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      
      const apocalypticData = await page.evaluate(() => {
        let startDate = '';
        let endDate = '';
        
        // Look for tables with "General Information"
        const tables = document.querySelectorAll('table');
        
        for (const table of tables) {
          const cells = table.querySelectorAll('td');
          
          for (const cell of cells) {
            const html = cell.innerHTML;
            
            if (html.includes('<b>Start:</b>') && html.includes('<b>End:</b>')) {
              const startMatch = html.match(/<b>Start:<\/b>\s*([A-Za-z]+\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}:\d{2}\s+[AP]M)/i);
              const endMatch = html.match(/<b>End:<\/b>\s*([A-Za-z]+\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}:\d{2}\s+[AP]M)/i);
              
              if (startMatch) startDate = startMatch[1];
              if (endMatch) endDate = endMatch[1];
              
              if (startDate && endDate) break;
            }
          }
          
          if (startDate && endDate) break;
        }
        
        return { startDate, endDate };
      });
      
      if (apocalypticData.startDate && apocalypticData.endDate) {
        const startTime = parseWikiDate(apocalypticData.startDate);
        const endTime = parseWikiDate(apocalypticData.endDate);
        
        if (startTime && endTime) {
          const wikiUrl = 'https://honkai-star-rail.fandom.com/wiki/Apocalyptic_Shadow';
          const title = extractTitleFromUrl(wikiUrl) || 'Apocalyptic Shadow';
          
          events.push({
            title: title,
            start: startTime,
            end: endTime,
            game: 'Honkai: Star Rail',
            image: '/images/honkai-star-rail/events/apocalyptic-shadow.png',
            description: 'Apocalyptic Shadow is a game mode within the Treasures Lightward section of the Interastral Peace Guide. It is unlocked after completing Adventure Mission Grim Film of Finality, and can be accessed by speaking with Elegy.',
            wikiUrl: wikiUrl
          });
          console.log(`✓ Apocalyptic Shadow: ${apocalypticData.startDate} - ${apocalypticData.endDate}`);
        }
      }
    } catch (error) {
      console.error('✗ Failed to scrape Apocalyptic Shadow:', error.message);
    }

    // ===== DIVERGENT UNIVERSE =====
    console.log('\n=== Scraping Divergent Universe ===');
    try {
      await page.goto('https://honkai-star-rail.fandom.com/wiki/Divergent_Universe', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      
      console.log('Initial page: https://honkai-star-rail.fandom.com/wiki/Divergent_Universe');
      
      const divergentUrl = await page.evaluate(() => {
        // Find last custom-tabs-default custom-tabs div
        const tabDivs = document.querySelectorAll('.custom-tabs-default.custom-tabs');
        if (tabDivs.length === 0) return '';
        
        const lastTabDiv = tabDivs[tabDivs.length - 1];
        // Find last span with <a> tag
        const spans = lastTabDiv.querySelectorAll('span');
        if (spans.length === 0) return '';
        
        const lastSpan = spans[spans.length - 1];
        const link = lastSpan.querySelector('a');
        if (!link) return '';
        
        let href = link.getAttribute('href') || '';
        if (href.startsWith('/wiki/')) {
          href = 'https://honkai-star-rail.fandom.com' + href;
        }
        return href;
      });
      
      console.log('Divergent Universe navigating to:', divergentUrl || 'NO URL FOUND');
      
      if (divergentUrl) {
        await page.goto(divergentUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        
        const divergentData = await page.evaluate(() => {
          // Get image data-image-key from infobox (same as other scrapers)
          const infoboxImg = document.querySelector('.infoboxtable img[data-image-key], .portable-infobox img[data-image-key]');
          let imageKey = '';
          let debugInfo = {
            foundElement: !!infoboxImg,
            hasDataImageKey: false,
            hasSrc: false,
            src: ''
          };
          
          if (infoboxImg) {
            imageKey = infoboxImg.getAttribute('data-image-key') || '';
            debugInfo.hasDataImageKey = !!imageKey;
            debugInfo.hasSrc = !!(infoboxImg.getAttribute('src') || infoboxImg.getAttribute('data-src'));
            debugInfo.src = infoboxImg.getAttribute('src') || infoboxImg.getAttribute('data-src') || '';
            
            // Fallback: extract filename from src if data-image-key is not available
            if (!imageKey) {
              const src = infoboxImg.getAttribute('src') || infoboxImg.getAttribute('data-src') || '';
              // Extract filename from URL like: .../Event_Divergent_Universe_Protean_Hero.png/...
              const match = src.match(/\/([^\/]+\.(?:png|jpg|jpeg|webp))/i);
              if (match) {
                imageKey = match[1];
              }
            }
          }
          
          // Get description from srw-description-content
          const descDiv = document.querySelector('.srw-description-content');
          const description = descDiv ? descDiv.innerText.trim() : '';
          
          // Get duration - look for "Start" and "End" in the page
          let startDate = '';
          let endDate = '';
          let isIndefinite = false;
          
          // Look in the entire page text
          const pageText = document.body.innerText;
          
          // Pattern: "Start\n26 February, 2025 06:00 GMT+8" or "Start\n26 February, 2025\n06:00 GMT+8"
          const startMatch = pageText.match(/Start[^\d]*(\d{1,2}\s+[A-Za-z]+,\s+\d{4})[^\d]*(\d{1,2}:\d{2})/i);
          
          // For end, look for "End\nIndefinite" or actual date (allow newlines between End and Indefinite)
          const endIndefinite = pageText.match(/End[\s\S]{0,20}Indefinite/i);
          if (endIndefinite) {
            isIndefinite = true;
          } else {
            const endMatch = pageText.match(/End[^\d]*(\d{1,2}\s+[A-Za-z]+,\s+\d{4})[^\d]*(\d{1,2}:\d{2})/i);
            if (endMatch) {
              endDate = `${endMatch[1]} ${endMatch[2]}`;
            }
          }
          
          if (startMatch) {
            startDate = `${startMatch[1]} ${startMatch[2]}`;
          }
          
          return { imageKey, description, startDate, endDate, isIndefinite, debugInfo };
        });
        
        console.log('Divergent Universe data:', divergentData);
        
        if (divergentData.startDate) {
          const startTime = parseWikiDate(divergentData.startDate);
          let endTime = null;
          
          if (divergentData.isIndefinite) {
            // For indefinite events, use "Indefinite" as the end date
            endTime = "Indefinite";
          } else if (divergentData.endDate) {
            endTime = parseWikiDate(divergentData.endDate);
          }
          
          if (startTime && endTime) {
            // Download image using File: page with data-image-key
            let localImagePath = '';
            if (divergentData.imageKey) {
              const filePageUrl = `${divergentUrl}?file=${encodeURIComponent(divergentData.imageKey)}`;
              console.log(`Navigating to File: page: ${filePageUrl}`);
              
              try {
                await page.goto(filePageUrl, { 
                  waitUntil: 'networkidle2', 
                  timeout: 30000 
                });
                
                // Get the "See full-size image" link
                const fullSizeUrl = await page.evaluate(() => {
                  const link = document.querySelector('a.see-full-size-link');
                  return link ? link.href : null;
                });
                
                if (fullSizeUrl) {
                  console.log(`Found full-size image URL`);
                  localImagePath = await downloadImage(
                    fullSizeUrl,
                    'honkai-star-rail/events',
                    'divergent-universe'
                  );
                }
              } catch (imgError) {
                console.log(`Failed to download image: ${imgError.message}`);
              }
            }
            
            const title = extractTitleFromUrl(divergentUrl) || 'Divergent Universe';
            
            events.push({
              title: title,
              start: startTime,
              end: endTime,
              game: 'Honkai: Star Rail',
              image: localImagePath || '/images/honkai-star-rail/events/divergent-universe.jpg',
              description: divergentData.description || 'The Divergent Universe is a Game System in Honkai: Star Rail that serves as a streamlined version of the Simulated Universe which is periodically updated with new content. At the start of a new Period, all progression from the previous Period is reset, except for Inspiration Circuit progress and Probability Museum configuration.',
              wikiUrl: divergentUrl
            });
            console.log(`✓ Divergent Universe: ${divergentData.startDate} - ${divergentData.endDate}`);
          }
        }
      }
    } catch (error) {
      console.error('✗ Failed to scrape Divergent Universe:', error.message);
    }

    // ===== CURRENCY WARS =====
    console.log('\n=== Scraping Currency Wars ===');
    try {
      await page.goto('https://honkai-star-rail.fandom.com/wiki/Currency_Wars', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      
      console.log('Initial page: https://honkai-star-rail.fandom.com/wiki/Currency_Wars');
      
      const currencyUrl = await page.evaluate(() => {
        // Find last custom-tabs-default custom-tabs div
        const tabDivs = document.querySelectorAll('.custom-tabs-default.custom-tabs');
        if (tabDivs.length === 0) return '';
        
        const lastTabDiv = tabDivs[tabDivs.length - 1];
        // Find last span with <a> tag
        const spans = lastTabDiv.querySelectorAll('span');
        if (spans.length === 0) return '';
        
        const lastSpan = spans[spans.length - 1];
        const link = lastSpan.querySelector('a');
        if (!link) return '';
        
        let href = link.getAttribute('href') || '';
        if (href.startsWith('/wiki/')) {
          href = 'https://honkai-star-rail.fandom.com' + href;
        }
        return href;
      });
      
      console.log('Currency Wars navigating to:', currencyUrl || 'NO URL FOUND');
      
      if (currencyUrl) {
        await page.goto(currencyUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        
        const currencyData = await page.evaluate(() => {
          // Get image data-image-key from infobox (same as other scrapers)
          const infoboxImg = document.querySelector('.infoboxtable img[data-image-key], .portable-infobox img[data-image-key]');
          let imageKey = '';
          if (infoboxImg) {
            imageKey = infoboxImg.getAttribute('data-image-key') || '';
            
            // Fallback: extract filename from src if data-image-key is not available
            if (!imageKey) {
              const src = infoboxImg.getAttribute('src') || infoboxImg.getAttribute('data-src') || '';
              // Extract filename from URL like: .../Event_Currency_Wars_Zero-Sum_Game.png/...
              const match = src.match(/\/([^\/]+\.(?:png|jpg|jpeg|webp))/i);
              if (match) {
                imageKey = match[1];
              }
            }
          }
          
          // Get description from srw-description-content
          const descDiv = document.querySelector('.srw-description-content');
          const description = descDiv ? descDiv.innerText.trim() : '';
          
          // Get duration - look for "Start" and "End" in the page
          let startDate = '';
          let endDate = '';
          let isIndefinite = false;
          
          // Look in the entire page text
          const pageText = document.body.innerText;
          
          // Pattern: "Start\n26 February, 2025 06:00 GMT+8" or "Start\n26 February, 2025\n06:00 GMT+8"
          const startMatch = pageText.match(/Start[^\d]*(\d{1,2}\s+[A-Za-z]+,\s+\d{4})[^\d]*(\d{1,2}:\d{2})/i);
          
          // For end, look for "End\nIndefinite" or actual date (allow newlines between End and Indefinite)
          const endIndefinite = pageText.match(/End[\s\S]{0,20}Indefinite/i);
          if (endIndefinite) {
            isIndefinite = true;
          } else {
            const endMatch = pageText.match(/End[^\d]*(\d{1,2}\s+[A-Za-z]+,\s+\d{4})[^\d]*(\d{1,2}:\d{2})/i);
            if (endMatch) {
              endDate = `${endMatch[1]} ${endMatch[2]}`;
            }
          }
          
          if (startMatch) {
            startDate = `${startMatch[1]} ${startMatch[2]}`;
          }
          
          return { imageKey, description, startDate, endDate, isIndefinite };
        });
        
        if (currencyData.startDate) {
          const startTime = parseWikiDate(currencyData.startDate);
          let endTime = null;
          
          if (currencyData.isIndefinite) {
            // For indefinite events, use "Indefinite" as the end date
            endTime = "Indefinite";
          } else if (currencyData.endDate) {
            endTime = parseWikiDate(currencyData.endDate);
          }
          
          if (startTime && endTime) {
            // Download image using File: page with data-image-key
            let localImagePath = '';
            if (currencyData.imageKey) {
              const filePageUrl = `${currencyUrl}?file=${encodeURIComponent(currencyData.imageKey)}`;
              console.log(`Navigating to File: page: ${filePageUrl}`);
              
              try {
                await page.goto(filePageUrl, { 
                  waitUntil: 'networkidle2', 
                  timeout: 30000 
                });
                
                // Get the "See full-size image" link
                const fullSizeUrl = await page.evaluate(() => {
                  const link = document.querySelector('a.see-full-size-link');
                  return link ? link.href : null;
                });
                
                if (fullSizeUrl) {
                  console.log(`Found full-size image URL`);
                  localImagePath = await downloadImage(
                    fullSizeUrl,
                    'honkai-star-rail/events',
                    'currency-wars'
                  );
                }
              } catch (imgError) {
                console.log(`Failed to download image: ${imgError.message}`);
              }
            }
            
            const title = extractTitleFromUrl(currencyUrl) || 'Currency Wars';
            
            events.push({
              title: title,
              start: startTime,
              end: endTime,
              game: 'Honkai: Star Rail',
              image: localImagePath || '/images/honkai-star-rail/events/currency-wars.jpg',
              description: currencyData.description || 'Currency Wars is a Game System in Honkai: Star Rail that is part of the Cosmic Strife tab in the Interastral Peace Guide. It is an auto-chess inspired mode that is periodically updated with new content. At the start of a new Period, all progression from the previous Period is reset except for Startup Guide and Advantage Layout progress.',
              wikiUrl: currencyUrl
            });
            console.log(`✓ Currency Wars: ${currencyData.startDate} - ${currencyData.endDate}`);
          }
        }
      }
    } catch (error) {
      console.error('✗ Failed to scrape Currency Wars:', error.message);
    }

    // ===== ANOMALY ARBITRATION =====
    console.log('\n=== Scraping Anomaly Arbitration ===');
    try {
      await page.goto('https://game8.co/games/Honkai-Star-Rail/archives/550759', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      
      const anomalyData = await page.evaluate(() => {
        let endDate = '';
        
        // Look for the reset time in the page - format: "2025/03/25 - 4:00 (Server Time)"
        const pageHTML = document.documentElement.outerHTML;
        
        // Try to find the date in the table
        const tables = document.querySelectorAll('table');
        
        for (const table of tables) {
          const rows = table.querySelectorAll('tr');
          
          for (const row of rows) {
            const th = row.querySelector('th');
            const td = row.querySelector('td');
            
            if (th && td && th.textContent.includes('Reset Time')) {
              const dateText = td.textContent.trim();
              // Format: "2025/03/25 - 4:00 (Server Time)"
              const match = dateText.match(/(\d{4}\/\d{1,2}\/\d{1,2})\s*-\s*(\d{1,2}:\d{2})/);
              
              if (match) {
                endDate = `${match[1]} ${match[2]}`;
                break;
              }
            }
          }
          
          if (endDate) break;
        }
        
        return { endDate };
      });
      
      if (anomalyData.endDate) {
        const endTime = parseWikiDate(anomalyData.endDate);
        
        if (endTime) {
          // Parse end time to get timestamp
          const endTimestamp = new Date(endTime).getTime();
          // Set start date to 42 days before end (6 weeks cycle)
          const startTimestamp = endTimestamp - (42 * 24 * 60 * 60 * 1000);
          const startTime = new Date(startTimestamp).toISOString();
          
          const wikiUrl = 'https://honkai-star-rail.fandom.com/wiki/Anomaly_Arbitration';
          const title = extractTitleFromUrl(wikiUrl) || 'Anomaly Arbitration';
          
          events.push({
            title: title,
            start: startTime,
            end: endTime,
            game: 'Honkai: Star Rail',
            image: '/images/honkai-star-rail/events/anomaly-arbitration.webp',
            description: 'Anomaly Arbitration is a recurring endgame challenge that resets every 6 weeks.',
            wikiUrl: wikiUrl
          });
          console.log(`✓ Anomaly Arbitration: End date ${anomalyData.endDate}`);
        }
      }
    } catch (error) {
      console.error('✗ Failed to scrape Anomaly Arbitration:', error.message);
    }

    // Save to file
    const outputPath = path.join(__dirname, '../src/data/scrapedStarRailEndgame.js');
    const fileContent = `// Auto-generated Star Rail endgame content
// Generated on: ${new Date().toISOString()}
// DO NOT EDIT MANUALLY - Run npm run scrape:starrail-endgame to update

export const scrapedStarRailEndgame = ${JSON.stringify(events, null, 2)};
`;

    fs.writeFileSync(outputPath, fileContent, 'utf8');
    console.log(`\n✓ Saved ${events.length} endgame events to ${outputPath}`);

  } catch (error) {
    console.error('Error during scraping:', error);
  } finally {
    await browser.close();
  }
}

scrapeStarRailEndgame();
