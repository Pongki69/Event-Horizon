// scrapeStarRailBanners.js
// Script to scrape Honkai: Star Rail banners from Game8
// Run with: node scripts/scrapeStarRailBanners.js

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { downloadImage, loadExistingImages, resolveImage } from './archiveUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Starting Honkai: Star Rail banner scraper...');

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
 * Star Rail banners start at 12:00 and end at 11:59 server time (UTC+8)
 */
function parseBannerDate(dateText, isEndDate = false) {
  const dateMatch = dateText.match(/([A-Za-z]+)\.?\s+(\d{1,2}),\s+(\d{4})/);
  if (dateMatch) {
    const [, monthName, day, year] = dateMatch;
    const month = monthToIndex(monthName);
    if (isEndDate) {
      console.log(`Parsed banner end date: ${monthName} ${day}, ${year} 11:59 UTC+8`);
      return Date.UTC(parseInt(year), month, parseInt(day), 3, 59, 0);
    } else {
      console.log(`Parsed banner start date: ${monthName} ${day}, ${year} 12:00 UTC+8`);
      return Date.UTC(parseInt(year), month, parseInt(day), 4, 0, 0);
    }
  }
  console.log(`Could not parse banner date from: ${dateText}`);
  return null;
}

/**
 * Resolve canonical wiki title via search API with proper filtering + scoring.
 * Handles:
 *   - Casing differences: "Silver Wolf Lv.999" -> "Silver Wolf LV.999"
 *   - Bullet-name pattern: "Summeretto" -> "Robin • Summeretto"
 *     (wiki uses "BaseCharacter • AltName" for rerun/variant characters)
 */
async function resolveWikiTitle(characterName) {
  try {
    const apiUrl = `https://honkai-star-rail.fandom.com/api.php?action=query&list=search&srsearch=${encodeURIComponent(characterName)}&srlimit=10&format=json&origin=*`;
    const res = await fetch(apiUrl);
    if (!res.ok) return null;
    const json = await res.json();
    const results = json?.query?.search;
    if (!results || results.length === 0) return null;

    // Filter out subpages (e.g. "Robin/Gallery")
    const mainPages = results.filter(r => !r.title.includes('/'));
    if (mainPages.length === 0) return null;

    const nameLower = characterName.toLowerCase().trim();

    // Score each result
    const scored = mainPages.map(r => {
      const titleLower = r.title.toLowerCase();
      let score = 0;

      if (titleLower === nameLower) {
        // Exact case-insensitive match
        score = 4;
      } else if (titleLower.includes('•')) {
        // Wiki bullet-name pattern: "BaseChar • ShortName"
        // e.g. query "Summeretto" matches "Robin • Summeretto"
        // e.g. query "Waveflair"  matches "Aventurine • Waveflair"
        const afterBullet = titleLower.split('•')[1]?.trim();
        const beforeBullet = titleLower.split('•')[0]?.trim();
        if (afterBullet === nameLower || beforeBullet === nameLower) {
          score = 3;
        } else if (afterBullet?.includes(nameLower) || titleLower.includes(nameLower)) {
          score = 2;
        }
      } else if (titleLower.includes(nameLower)) {
        score = 1;
      }

      return { title: r.title, score };
    });

    // Pick best scoring result — require at least score 3 to avoid false positives
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best || best.score < 3) return null;

    return best.title !== characterName ? best.title : null;
  } catch {
    return null;
  }
}


async function fetchCharacterImage(characterName) {
  // Resolve canonical title via search API to handle casing (e.g. "Silver Wolf Lv.999" -> "Silver Wolf LV.999")
  const canonical = await resolveWikiTitle(characterName);
  const resolvedName = canonical || characterName;
  if (canonical && canonical !== characterName) {
    console.log(`  Resolved: "${characterName}" -> "${canonical}"`);
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const extractImage = async (page) => page.evaluate(() => {
    const h2Elements = document.querySelectorAll('h2');
    let characterIntroH2 = null;
    for (const h2 of h2Elements) {
      const span = h2.querySelector('span');
      if (span && span.textContent.includes('Character Introduction')) {
        characterIntroH2 = h2;
        break;
      }
    }
    if (!characterIntroH2) return '';
    let element = characterIntroH2.nextElementSibling;
    while (element) {
      const img = element.querySelector('img');
      if (img) {
        let src = img.getAttribute('data-src') || img.getAttribute('src') || '';
        if (src && !src.startsWith('http')) {
          if (src.startsWith('//')) src = 'https:' + src;
          else if (src.startsWith('/')) src = 'https://static.wikia.nocookie.net' + src;
        }
        src = src.split('/revision/')[0];
        return src;
      }
      element = element.nextElementSibling;
      if (element && element.tagName === 'H2') break;
    }
    return '';
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    const formattedName = resolvedName.trim().replace(/\s+/g, '_');
    const mediaUrl = `https://honkai-star-rail.fandom.com/wiki/${formattedName}/Media`;
    console.log(`  Fetching image from: ${mediaUrl}`);
    await page.goto(mediaUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const imageUrl = await extractImage(page);
    await browser.close();

    if (imageUrl) {
      console.log(`  ✓ Found image (${imageUrl.length} chars)`);
      return { imageUrl, resolvedName };
    }

    console.log(`  ✗ No image found`);
    return { imageUrl: '', resolvedName };
  } catch (error) {
    console.log(`  ✗ Error fetching image: ${error.message}`);
    return { imageUrl: '', resolvedName };
  }
}

/**
 * Fetch character description and title from Honkai Star Rail wiki
 */
async function fetchCharacterDescription(characterName) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const extractData = async (page) => page.evaluate(() => {
    const titleH2 = document.querySelector('h2[data-item-name="title"]');
    const title = titleH2 ? titleH2.textContent.trim() : '';
    const descElement = document.querySelector('.srw-description-content');
    const description = descElement ? descElement.textContent.trim() : '';
    return { description, title };
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    // Resolve canonical title via search API
    const canonical = await resolveWikiTitle(characterName);
    const resolvedName = canonical || characterName;
    if (canonical && canonical !== characterName) {
      console.log(`  Resolved: "${characterName}" -> "${canonical}"`);
    }

    const formattedName = resolvedName.trim().replace(/\s+/g, '_');
    const wikiUrl = `https://honkai-star-rail.fandom.com/wiki/${formattedName}`;
    console.log(`  Fetching description from: ${wikiUrl}`);
    await page.goto(wikiUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const data = await extractData(page);

    await browser.close();

    if (data.description) console.log(`  ✓ Found description (${data.description.length} chars)`);
    else console.log(`  ✗ No description found`);
    if (data.title) console.log(`  ✓ Found title: ${data.title}`);

    return data;
  } catch (error) {
    console.log(`  ✗ Error fetching description: ${error.message}`);
    return { description: '', title: '' };
  }
}

async function scrapeStarRailBanners() {
  console.log('Fetching banners from Game8...');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    // Navigate to Game8 banner schedule page
    await page.goto('https://game8.co/games/Honkai-Star-Rail/archives/408381', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    console.log('Page loaded, extracting banner data...');
    
    // Enable console logging from page
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    
    // Scroll to load lazy images
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
    
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Extract banner data from the page
    const banners = await page.evaluate(() => {
      const bannerData = [];
      const seen = new Set();
      
      // Find h4 with "Honkai Star Rail Warp Banner Dates" or similar
      const h4Elements = document.querySelectorAll('h4');
      let targetH4 = null;
      
      for (const h4 of h4Elements) {
        const text = h4.textContent;
        if (text.includes('Warp Banner') || text.includes('Banner Dates')) {
          targetH4 = h4;
          break;
        }
      }
      
      if (!targetH4) {
        return [];
      }
      
      // Find the table after this h4
      let table = targetH4.nextElementSibling;
      while (table && table.tagName !== 'TABLE') {
        table = table.nextElementSibling;
      }
      
      if (!table) {
        return [];
      }
      
      // Process table rows
      const rows = table.querySelectorAll('tr');
      
      for (let i = 1; i < rows.length; i++) { // Skip header row
        const row = rows[i];
        const cells = row.querySelectorAll('td');
        
        if (cells.length < 2) continue;
        
        // 2nd column (index 1) is "Banner Schedule and Dates"
        const scheduleCell = cells[1];
        
        // Find all div.align elements (each represents one banner)
        const bannerDivs = scheduleCell.querySelectorAll('div.align');
        
        console.log(`Row ${i}: Found ${bannerDivs.length} div.align elements`);
        
        // Extract date range from the cell text
        // Format: (MM/DD - MM/DD/YYYY) or (MM/DD/YYYY - MM/DD/YYYY)
        const cellText = scheduleCell.textContent;
        const dateMatch = cellText.match(/\((\d{2}\/\d{2}(?:\/\d{4})?)\s*-\s*(\d{2}\/\d{2}\/\d{4})\)/);
        
        if (!dateMatch) continue;
        
        let [, startDateStr, endDateStr] = dateMatch;
        
        // If start date doesn't have year, use year from end date
        if (!startDateStr.includes('/202')) {
          const endYear = endDateStr.match(/\/(\d{4})$/)[1];
          startDateStr = startDateStr + '/' + endYear;
        }
        
        // Convert MM/DD/YYYY to "Month Day, Year" format
        const parseShortDate = (dateStr) => {
          const [month, day, year] = dateStr.split('/');
          const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                             'July', 'August', 'September', 'October', 'November', 'December'];
          return `${monthNames[parseInt(month) - 1]} ${parseInt(day)}, ${year}`;
        };
        
        const startDate = parseShortDate(startDateStr);
        const endDate = parseShortDate(endDateStr);
        
        // Process each div.align (each is one banner)
        for (const bannerDiv of bannerDivs) {
          // Get the FIRST <a class="a-link"> tag in this div
          const firstLink = bannerDiv.querySelector('a.a-link');
          
          if (!firstLink) continue;
          
          const characterName = firstLink.textContent.trim();
          
          if (!characterName || characterName.length < 2) continue;
          
          // Create unique key
          const key = `${characterName}-${startDate}-${endDate}`;
          if (seen.has(key)) continue;
          seen.add(key);
          
          // Determine if this is current or upcoming
          const now = new Date();
          const start = new Date(startDate);
          const type = start > now ? 'upcoming' : 'test-run';
          
          bannerData.push({
            name: characterName,
            startDate: startDate,
            endDate: endDate,
            type: type
          });
        }
      }
      
      return bannerData;
    });

    console.log(`Found ${banners.length} banners`);

    await browser.close();

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

      // Fetch character image from wiki — tries original name first, then all-caps fallback
      const { imageUrl, resolvedName } = await fetchCharacterImage(banner.name);
      
      // Download image
      let localImage = '';
      if (imageUrl && !imageUrl.startsWith('data:')) {
        console.log(`  Downloading image for ${resolvedName}...`);
        localImage = await downloadImage(
          imageUrl,
          'honkai-star-rail',
          resolvedName,
          'banners'
        );
        
        if (localImage) {
          console.log(`  ✓ Image saved: ${localImage}`);
        }
      }
      
      // Fetch character description and title from wiki (uses same fallback logic)
      const { description, title } = await fetchCharacterDescription(resolvedName);
      
      // Remove citation numbers like [1], [2], etc. from description
      const cleanDescription = description.replace(/\[\d+\]/g, '').trim();
      
      // Create title: "Character Name - Title"
      const bannerTitle = title 
        ? `${resolvedName} - ${title}`
        : resolvedName;
      
      // Create wiki URL using resolved name
      const wikiName = resolvedName.trim().replace(/\s+/g, '_');
      const wikiUrl = `https://honkai-star-rail.fandom.com/wiki/${wikiName}`;
      
      processedBanners.push({
        title: bannerTitle,
        start: new Date(startDate).toISOString(),
        end: new Date(endDate).toISOString(),
        image: localImage || '',
        type: banner.type,
        game: 'Honkai: Star Rail',
        description: cleanDescription || `${banner.name} character banner.`,
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

    const jsCode = `// scrapedStarRailBanners.js
// Auto-generated by scrapeStarRailBanners.js
// Last updated: ${new Date().toISOString()}

export const scrapedStarRailBanners = [
${bannersCode}
];
`;

    // Write to file
    const outputPath = path.join(__dirname, '..', 'src', 'data', 'scrapedStarRailBanners.js');
    const existingImageMap = await loadExistingImages(outputPath, 'scrapedStarRailBanners');

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

    const jsCodeFinal = `// scrapedStarRailBanners.js
// Auto-generated by scrapeStarRailBanners.js
// Last updated: ${new Date().toISOString()}

export const scrapedStarRailBanners = [
${bannersCodeFinal}
];
`;

    fs.writeFileSync(outputPath, jsCodeFinal);

    console.log(`\n✅ Banners saved to: ${outputPath}`);
    console.log(`📊 Total banners: ${processedBanners.length}`);

  } catch (error) {
    console.error('Error during scraping:', error);
    await browser.close();
    process.exit(1);
  }
}

scrapeStarRailBanners();
