// scrapeGenshinBanners.js
// Script to scrape Genshin Impact banners from Game8
// Run with: node scripts/scrapeGenshinBanners.js

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { downloadImage, loadExistingImages, resolveImage } from './archiveUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Starting Genshin Impact banner scraper...');

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
  return months[monthName.toLowerCase().replace('.', '')];
}

/**
 * Parse Game8 date format and convert to UTC timestamp
 * Genshin banners start at 11:00 Asia time (UTC+8) = 03:00 UTC
 * Genshin banners end at 14:59 Asia time (UTC+8) = 06:59 UTC
 */
function parseBannerDate(dateText, isEndDate = false) {
  // Match format: "Month Day, Year" or "Mon. Day, Year"
  const dateMatch = dateText.match(/([A-Za-z]+)\.?\s+(\d{1,2}),\s+(\d{4})/);
  
  if (dateMatch) {
    const [, monthName, day, year] = dateMatch;
    const month = monthToIndex(monthName);

    // Sanity check: clamp years that are clearly typos (e.g. 2206 → 2026)
    let parsedYear = parseInt(year);
    const currentYear = new Date().getFullYear();
    if (parsedYear > currentYear + 5) {
      // Likely a digit transposition (e.g. 2206 → 2026) — fix the two middle digits
      const yearStr = String(parsedYear);
      const fixed = yearStr[0] + yearStr[2] + yearStr[1] + yearStr[3];
      const fixedYear = parseInt(fixed);
      if (fixedYear >= currentYear - 1 && fixedYear <= currentYear + 5) {
        console.log(`  ⚠️  Year ${parsedYear} looks like a typo, correcting to ${fixedYear}`);
        parsedYear = fixedYear;
      }
    }
    
    if (isEndDate) {
      // Banner ends at 14:59 Asia time (UTC+8) = 06:59 UTC
      console.log(`Parsed banner end date: ${monthName} ${day}, ${parsedYear} 14:59 UTC+8`);
      return Date.UTC(parsedYear, month, parseInt(day), 6, 59, 0);
    } else {
      // Banner starts at 11:00 AM Asia time (UTC+8) = 03:00 UTC
      console.log(`Parsed banner start date: ${monthName} ${day}, ${parsedYear} 11:00 UTC+8`);
      return Date.UTC(parsedYear, month, parseInt(day), 3, 0, 0);
    }
  }
  
  console.log(`Could not parse banner date from: ${dateText}`);
  return null;
}

/**
 * Fetch character description from Genshin Impact Fandom wiki
 * @param {string} characterName - Character name (e.g., "Zibai" or "Kamisato Ayato")
 * @returns {Promise<string>} Character description from profile page
 */
async function fetchCharacterDescription(characterName) {
  try {
    // Format character name for URL (replace spaces with underscores)
    const formattedName = characterName.trim().replace(/\s+/g, '_');
    const profileUrl = `https://genshin-impact.fandom.com/wiki/${formattedName}/Profile`;
    
    console.log(`  Fetching description from: ${profileUrl}`);
    
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    await page.goto(profileUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });
    
    // Extract description from <blockquote><p>
    const description = await page.evaluate(() => {
      const blockquote = document.querySelector('blockquote');
      if (blockquote) {
        const p = blockquote.querySelector('p');
        if (p) {
          return p.textContent.trim();
        }
      }
      return '';
    });
    
    await browser.close();
    
    if (description) {
      console.log(`  ✓ Found description (${description.length} chars)`);
      return description;
    } else {
      console.log(`  ✗ No description found`);
      return `${characterName} character banner.`;
    }
  } catch (error) {
    console.log(`  ✗ Error fetching description: ${error.message}`);
    return `${characterName} character banner.`;
  }
}

async function scrapeGenshinBanners() {
  console.log('Fetching banners from Game8...');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    // Navigate to Game8 banner schedule page
    await page.goto('https://game8.co/games/Genshin-Impact/archives/305012', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    console.log('Page loaded, extracting banner data...');
    
    // Add debug logging
    await page.evaluate(() => {
      console.log('=== DEBUG: Looking for tables ===');
      const tables = document.querySelectorAll('table');
      console.log(`Found ${tables.length} tables`);
      
      tables.forEach((table, i) => {
        if (table.textContent.includes('Banner Dates')) {
          console.log(`\nTable ${i} contains Banner Dates`);
          const rows = table.querySelectorAll('tr');
          console.log(`  Rows: ${rows.length}`);
          
          rows.forEach((row, j) => {
            const tds = row.querySelectorAll('td');
            console.log(`  Row ${j}: ${tds.length} td elements`);
            
            tds.forEach((td, k) => {
              const imgs = td.querySelectorAll('img');
              console.log(`    TD ${k}: ${imgs.length} images`);
              if (imgs.length > 0) {
                imgs.forEach((img, m) => {
                  const src = img.src || img.getAttribute('data-src') || '';
                  console.log(`      Image ${m}: ${src.substring(0, 80)}`);
                });
              }
            });
          });
        }
      });
    });

    // Wait for content to load and scroll to trigger lazy loading
    await page.waitForSelector('body', { timeout: 10000 });
    
    // Scroll down to load lazy images
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
    
    // Wait a bit more for images to load
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Extract banner data from the page
    const banners = await page.evaluate(() => {
      const bannerData = [];
      const seen = new Set(); // Track unique banners
      
      // Find all tables on the page
      const tables = document.querySelectorAll('table');
      
      for (const table of tables) {
        // Check if this table contains banner information
        if (!table.textContent.includes('Banner Dates') || !table.textContent.includes('5 Star Rate-Up')) {
          continue;
        }
        
        // Process each row in the table
        const rows = table.querySelectorAll('tr');
        
        for (const row of rows) {
          const text = row.textContent;
          
          // Skip rows that don't have the required information
          if (!text.includes('Banner Dates') || !text.includes('5 Star Rate-Up')) {
            continue;
          }
          
          // Extract dates
          const dateMatch = text.match(/Banner Dates?:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})\s*-\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/);
          if (!dateMatch) continue;
          
          const [, startDate, endDate] = dateMatch;
          
          // Extract character name after "5 Star Rate-Up:"
          const charMatch = text.match(/5 Star Rate-Up:\s*([A-Za-z\s]+?)(?:\n|4 Star|Banner|Version|$)/);
          if (!charMatch) continue;
          
          const characterName = charMatch[1].trim();
          if (!characterName || characterName.length < 2) continue;
          
          // Create unique key
          const key = `${characterName}-${startDate}-${endDate}`;
          if (seen.has(key)) continue;
          seen.add(key);
          
          // Get the first <td> which contains the banner image and name
          const firstTd = row.querySelector('td');
          if (!firstTd) continue;
          
          // Get banner name from <a> tag in first <td>
          let bannerNameFromLink = '';
          const link = firstTd.querySelector('a');
          if (link) {
            bannerNameFromLink = link.textContent.trim();
          }
          
          // Get image from first <td>
          let imageUrl = '';
          const img = firstTd.querySelector('img');
          if (img) {
            const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
            if (src && !src.startsWith('data:')) {
              imageUrl = src.split('/revision')[0];
            }
          }
          
          // Determine if this is current or upcoming
          const now = new Date();
          const start = new Date(startDate);
          const type = start > now ? 'upcoming' : 'test-run';
          
          bannerData.push({
            name: characterName,
            bannerNameFromLink: bannerNameFromLink,
            startDate: startDate,
            endDate: endDate,
            imageUrl: imageUrl,
            type: type
          });
        }
      }
      
      return bannerData;
    });

    console.log(`Found ${banners.length} banners`);

    // Process each banner
    const processedBanners = [];
    
    for (const banner of banners) {
      console.log(`\nProcessing banner: ${banner.name}`);
      
      // Parse dates
      const startDate = parseBannerDate(banner.startDate, false);
      const endDate = parseBannerDate(banner.endDate, true);
      
      if (!startDate || !endDate) {
        console.log(`  ✗ Skipping ${banner.name}: invalid dates`);
        continue;
      }
      
      // Download banner image
      let localImage = '';
      if (banner.imageUrl && !banner.imageUrl.startsWith('data:')) {
        console.log(`  Downloading image for ${banner.name}...`);
        localImage = await downloadImage(
          banner.imageUrl,
          'genshin-impact',
          banner.name,
          'banners'
        );
        
        if (localImage) {
          console.log(`  ✓ Image saved: ${localImage}`);
        }
      } else if (banner.imageUrl && banner.imageUrl.startsWith('data:')) {
        console.log(`  ✗ Skipping data: URL for ${banner.name}`);
      }
      
      // Fetch character description from wiki
      const description = await fetchCharacterDescription(banner.name);
      
      // Create title: "Character Name - Banner Name"
      const title = banner.bannerNameFromLink 
        ? `${banner.name} - ${banner.bannerNameFromLink}`
        : banner.name;
      
      // Create wiki URL
      const wikiName = banner.name.trim().replace(/\s+/g, '_');
      const wikiUrl = `https://genshin-impact.fandom.com/wiki/${wikiName}`;
      
      processedBanners.push({
        title: title,
        start: new Date(startDate).toISOString(),
        end: new Date(endDate).toISOString(),
        image: localImage || '',
        type: banner.type,
        game: 'Genshin Impact',
        description: description,
        wikiUrl: wikiUrl
      });
    }

    console.log(`\nProcessed ${processedBanners.length} banners`);

    // Generate JavaScript code
    const bannersCode = processedBanners.map(banner => {
      return `  {
    title: '${banner.title.replace(/'/g, "\\'")}',
    start: new Date('${banner.start}'),
    end: new Date('${banner.end}'),
    image: '${banner.image}',
    type: '${banner.type}',
    game: '${banner.game}',
    description: '${banner.description.replace(/'/g, "\\'")}',
    wikiUrl: '${banner.wikiUrl}',
  }`;
    }).join(',\n');

    const jsCode = `// scrapedGenshinBanners.js
// Auto-generated by scrapeGenshinBanners.js
// Last updated: ${new Date().toISOString()}

export const scrapedGenshinBanners = [
${bannersCode}
];
`;

    // Write to file
    const outputPath = path.join(__dirname, '..', 'src', 'data', 'scrapedGenshinBanners.js');
    const existingImageMap = await loadExistingImages(outputPath, 'scrapedGenshinBanners');

    const bannersCodeFinal = processedBanners.map(banner => {
      const img = resolveImage(banner.image, banner.title, existingImageMap);
      return `  {
    title: '${banner.title.replace(/'/g, "\\'")}',
    start: new Date('${banner.start}'),
    end: new Date('${banner.end}'),
    image: '${img.replace(/'/g, "\\'")}',
    type: '${banner.type}',
    game: '${banner.game}',
    description: '${banner.description.replace(/'/g, "\\'")}',
    wikiUrl: '${banner.wikiUrl}',
  }`;
    }).join(',\n');

    const jsCodeFinal = `// scrapedGenshinBanners.js
// Auto-generated by scrapeGenshinBanners.js
// Last updated: ${new Date().toISOString()}

export const scrapedGenshinBanners = [
${bannersCodeFinal}
];
`;

    fs.writeFileSync(outputPath, jsCodeFinal);

    console.log(`\n✅ Banners saved to: ${outputPath}`);
    console.log(`📊 Total banners: ${processedBanners.length}`);

    await browser.close();
  } catch (error) {
    console.error('Error during scraping:', error);
    await browser.close();
    process.exit(1);
  }
}

scrapeGenshinBanners();
