// scrapeWuwaBanners.js
// Scraper for Wuthering Waves banners
// Run with: node scripts/scrapeWuwaBanners.js

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { downloadImage, loadExistingImages, resolveImage } from './archiveUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Starting Wuthering Waves Banners scraper...');

puppeteer.use(StealthPlugin());

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
 * Parse Wuwa banner date to UTC timestamp.
 * Wuwa banners reset at 10:00 server time (UTC+8) = 02:00 UTC.
 */
function parseWuwaDate(dateStr, isEnd = false) {
  const dateMatch = dateStr.match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/);
  if (!dateMatch) return null;
  const [, monthName, day, year] = dateMatch;
  const month = monthToIndex(monthName);
  if (month === undefined || month === null || isNaN(month)) return null;
  // 10:00 UTC+8 = 02:00 UTC
  return Date.UTC(parseInt(year), month, parseInt(day), 2, 0, 0);
}

/**
 * Resolve a character/weapon image URL via the Wuwa Fandom wiki API.
 * Priority:
 *   Characters: Splash Art > Profile Reveal > Card
 *   Weapons: Absolute Pulsation banner image > Weapon icon
 * Returns the direct static URL (with /revision stripped for full res), or null.
 */
async function resolveWuwaWikiImage(name, startDateIso = null) {
  // Character image candidates (in priority order)
  const characterCandidates = [
    `${name}_Splash_Art.png`,
    `${name}_Splash_Art.jpg`,
    `${name}_Profile_Reveal.jpg`,
    `${name}_Profile_Reveal.png`,
    `${name}_Card.png`,
  ];
  for (const filename of characterCandidates) {
    try {
      const apiUrl = `https://wutheringwaves.fandom.com/api.php?action=query&titles=File:${encodeURIComponent(filename)}&prop=imageinfo&iiprop=url&format=json&origin=*`;
      const res = await fetch(apiUrl);
      if (!res.ok) continue;
      const json = await res.json();
      const page = Object.values(json?.query?.pages || {})[0];
      if (page?.imageinfo?.[0]?.url) {
        console.log(`    → Resolved via API: ${filename}`);
        return page.imageinfo[0].url.split('/revision')[0];
      }
    } catch (_) { /* try next */ }
  }

  // Weapon fallback: search for "Absolute_Pulsation_{Name}_YYYY-MM-DD.jpg/png"
  // Use first word only as prefix to avoid apostrophe/special char issues
  try {
    const firstWord = name.split(/[\s']/)[0];
    const prefix = `Absolute_Pulsation_${firstWord}`;
    const searchUrl = `https://wutheringwaves.fandom.com/api.php?action=query&list=allimages&aiprefix=${encodeURIComponent(prefix)}&ailimit=10&aiprop=url|timestamp&format=json&origin=*`;
    const res = await fetch(searchUrl);
    if (res.ok) {
      const json = await res.json();
      // Filter to only images that actually contain the full name
      const images = (json?.query?.allimages || []).filter(img =>
        img.name.toLowerCase().includes(name.toLowerCase().split(' ')[0].toLowerCase())
      );
      if (images.length > 0) {
        // Pick the one whose date suffix is closest to (and not after) the banner start
        let best = null;
        if (startDateIso) {
          const startDate = new Date(startDateIso);
          const valid = images.filter(img => {
            const dateMatch = img.name.match(/(\d{4}-\d{2}-\d{2})\.(jpg|png)$/i);
            if (!dateMatch) return true;
            return new Date(dateMatch[1]) <= startDate;
          });
          best = valid.length > 0 ? valid[valid.length - 1] : images[images.length - 1];
        } else {
          best = images[images.length - 1];
        }
        if (best?.url) {
          console.log(`    → Resolved via API (Absolute Pulsation): ${best.name}`);
          return best.url.split('/revision')[0];
        }
      }
    }
  } catch (_) { /* fall through */ }

  // Last resort: weapon icon
  const weaponCandidates = [
    `Weapon_${name}.png`,
    `${name}.png`,
  ];
  for (const filename of weaponCandidates) {
    try {
      const apiUrl = `https://wutheringwaves.fandom.com/api.php?action=query&titles=File:${encodeURIComponent(filename)}&prop=imageinfo&iiprop=url&format=json&origin=*`;
      const res = await fetch(apiUrl);
      if (!res.ok) continue;
      const json = await res.json();
      const page = Object.values(json?.query?.pages || {})[0];
      if (page?.imageinfo?.[0]?.url) {
        console.log(`    → Resolved via API: ${filename}`);
        return page.imageinfo[0].url.split('/revision')[0];
      }
    } catch (_) { /* try next */ }
  }

  return null;
}

async function scrapeWuwaBanners() {
  console.log('Fetching banners from Game8...');

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
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    // Navigate to banners page
    await page.goto('https://game8.co/games/Wuthering-Waves/archives/453303', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    console.log('Page loaded, extracting banners...');
    
    // Wait for content to load
    await page.waitForSelector('body', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Extract banners from banner sections (check both h2 and h3 headings)
    const banners = await page.evaluate(() => {
      const bannerList = [];

      // Match h2 AND h3 headings for current and upcoming sections
      const headings = [...document.querySelectorAll('h2, h3')];
      const sectionsToProcess = [];

      for (const heading of headings) {
        const text = heading.textContent.trim();
        // Match patterns like "Current Banners", "Upcoming Character Banners", etc.
        const matchesCurrent = (text.includes('Current') || text.includes('Available')) && 
                              (text.includes('Banner') || text.includes('Character') || text.includes('Convene'));
        const matchesUpcoming = text.includes('Upcoming') && 
                               (text.includes('Banner') || text.includes('Character'));
        
        if (matchesCurrent || matchesUpcoming) {
          const isUpcoming = text.includes('Upcoming');
          sectionsToProcess.push({ heading, isUpcoming });
        }
      }

      // Each h2/h3 section can contain multiple tables
      for (const { heading, isUpcoming } of sectionsToProcess) {
        let element = heading.nextElementSibling;

        while (element) {
          // Stop at next heading of same or higher level
          if ((element.tagName === 'H2') || 
              (element.tagName === 'H3' && heading.tagName === 'H3')) {
            break;
          }

          if (element.tagName === 'TABLE') {
            const table = element;
            const rows = table.querySelectorAll('tr');

            // Last row is the date row (single cell containing date range)
            const lastRow = rows[rows.length - 1];
            const lastCells = lastRow ? lastRow.querySelectorAll('td') : [];
            let durationText = lastCells.length === 1 ? lastCells[0].textContent.trim() : '';

            // Walk all data rows (skip header row at index 0)
            for (let i = 1; i < rows.length; i++) {
              const row = rows[i];
              const cells = row.querySelectorAll('td');

              // Skip the single-cell date row
              if (cells.length < 2) continue;

              // First cell: banner image (img tag, direct src or data-src)
              const bannerCell = cells[0];
              const img = bannerCell.querySelector('img');
              let imageUrl = img ? (img.getAttribute('src') || img.getAttribute('data-src') || '') : '';
              // Skip data: URIs (not loaded yet)
              if (imageUrl.startsWith('data:')) imageUrl = '';

              // Second cell: featured characters — find ALL 5★ characters (multiple can be featured)
              const characterCell = cells[1];
              const cellText = characterCell.textContent;
              
              // Check if this row contains "5★ Limited Rate-Up" or "5★ Rate-Up"
              if (!cellText.includes('5★')) continue;
              
              const links = characterCell.querySelectorAll('a');
              
              // Extract character names from links
              // Strategy: get all links, then filter by checking if they appear after "5★" in the text
              const fiveStarText = cellText.split('5★')[1]; // Everything after "5★"
              if (!fiveStarText) continue;
              
              const fourStarIndex = fiveStarText.indexOf('4★');
              const fiveStarOnlyText = fourStarIndex > 0 ? fiveStarText.substring(0, fourStarIndex) : fiveStarText;
              
              const characterNames = [];
              for (const link of links) {
                const linkText = link.textContent.trim();
                // Check if this link text appears in the 5★ section
                if (fiveStarOnlyText.includes(linkText) && linkText.length > 1 && !linkText.includes('★')) {
                  characterNames.push(linkText);
                }
              }
              
              // If no character names found from links, skip
              if (characterNames.length === 0) continue;

              // Create a banner entry for EACH 5★ character/weapon
              for (const characterName of characterNames) {
                bannerList.push({
                  characterName,
                  imageUrl,
                  durationText,
                  isUpcoming
                });
              }
            }
          }

          element = element.nextElementSibling;
        }
      }

      return bannerList;
    });

    console.log(`Found ${banners.length} banners`);

    // Process each banner
    const processedBanners = [];
    
    for (const banner of banners) {
      console.log(`\n  Banner: ${banner.characterName}`);
      console.log(`    Duration text: ${banner.durationText.replace(/\n/g, ' ').substring(0, 80)}`);

      // Parse duration — handles both:
      //   "Banner Countdown:\nJuly 30, 2026 - August 19, 2026\n..."  (current)
      //   "Banner Start:\nAugust 20, 2026 - September 10, 2026"       (upcoming)
      const durationMatch = banner.durationText.match(/([A-Za-z]+\s+\d{1,2},\s+\d{4})\s*[-–]\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/);

      if (!durationMatch) {
        console.log(`    ✗ Could not parse duration format`);
        continue;
      }

      const [, startDateStr, endDateStr] = durationMatch;
      const startTs = parseWuwaDate(startDateStr);
      const endTs   = parseWuwaDate(endDateStr);

      if (!startTs || !endTs) {
        console.log(`    ✗ Failed to parse dates`);
        continue;
      }

      // Determine type: current if already started, upcoming otherwise
      const now = Date.now();
      const type = startTs <= now ? 'current' : 'upcoming';

      console.log(`    Type: ${type}`);
      console.log(`    Start: ${new Date(startTs).toISOString()}`);
      console.log(`    End:   ${new Date(endTs).toISOString()}`);
      
      // Fetch character description from wiki
      let description = 'Click the photo to see the banner description';
      
      try {
        // Try the main character page first (not /Backstory)
        const wikiUrl = `https://wutheringwaves.fandom.com/wiki/${encodeURIComponent(banner.characterName)}`;
        console.log(`    Fetching description from: ${wikiUrl}`);
        
        const wikiPage = await browser.newPage();
        await wikiPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        
        await wikiPage.goto(wikiUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Extract description from Official Introduction section
        const wikiDescription = await wikiPage.evaluate(() => {
          // Find the div with class "pull-quote__text"
          const pullQuoteDiv = document.querySelector('.pull-quote__text');
          
          if (pullQuoteDiv) {
            // Get all paragraphs
            const paragraphs = pullQuoteDiv.querySelectorAll('p');
            
            console.log(`[DEBUG] Found ${paragraphs.length} paragraphs in pull-quote__text`);
            
            // We want the second paragraph (index 1) if it exists
            if (paragraphs.length >= 2) {
              console.log(`[DEBUG] Returning second paragraph:`, paragraphs[1].textContent.substring(0, 50));
              return paragraphs[1].textContent.trim();
            }
            
            // Fallback to first paragraph if only one exists
            if (paragraphs.length === 1) {
              console.log(`[DEBUG] Only one paragraph, returning it:`, paragraphs[0].textContent.substring(0, 50));
              return paragraphs[0].textContent.trim();
            }
          }
          
          return '';
        });
        
        await wikiPage.close();
        
        if (wikiDescription) {
          description = wikiDescription;
          console.log(`    ✓ Description: "${description.substring(0, 100)}..."`);
        } else {
          console.log(`    ⚠ No description found, using fallback`);
        }
      } catch (error) {
        console.log(`    ⚠ Failed to fetch description: ${error.message}`);
      }
      
      // Download banner image — try Game8 first, fall back to Wuwa wiki
      let localImage = '';
      if (banner.imageUrl && !banner.imageUrl.startsWith('data:')) {
        let fullImageUrl = banner.imageUrl;
        if (fullImageUrl.startsWith('//')) fullImageUrl = 'https:' + fullImageUrl;
        else if (fullImageUrl.startsWith('/')) fullImageUrl = 'https://game8.co' + fullImageUrl;
        fullImageUrl = fullImageUrl.split('?')[0];

        console.log(`    Downloading image from Game8...`);
        localImage = await downloadImage(fullImageUrl, 'wuthering-waves', banner.characterName, 'banners');
        if (localImage) console.log(`    ✓ Image saved: ${localImage}`);
      }

      // Fallback: resolve image via Wuwa Fandom wiki API (no scraping needed)
      if (!localImage) {
        console.log(`    ⚠ No Game8 image, trying Wuwa wiki API...`);
        try {
          const resolvedUrl = await resolveWuwaWikiImage(banner.characterName, new Date(startTs).toISOString());
          if (resolvedUrl) {
            console.log(`    ✓ Found wiki image`);
            localImage = await downloadImage(resolvedUrl, 'wuthering-waves', banner.characterName, 'banners');
            if (localImage) console.log(`    ✓ Image saved: ${localImage}`);
          } else {
            console.log(`    ✗ No image found on wiki`);
          }
        } catch (imgErr) {
          console.log(`    ✗ Wiki image fetch failed: ${imgErr.message}`);
        }
      }
      
      processedBanners.push({
        title: banner.characterName,
        start: new Date(startTs).toISOString(),
        end: new Date(endTs).toISOString(),
        image: localImage || '',
        description: description,
        game: 'Wuthering Waves',
        type: type
      });
      
      console.log(`    ✓ Banner processed successfully`);
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    await browser.close();

    console.log(`\n\nProcessed ${processedBanners.length} banners`);

    // Generate JavaScript code
    const bannersCode = processedBanners.map(banner => {
      return `  {
    title: '${banner.title.replace(/'/g, "\\'")}',
    start: new Date('${banner.start}'),
    end: new Date('${banner.end}'),
    image: '${banner.image}',
    description: \`${banner.description.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`,
    game: '${banner.game}',
  }`;
    }).join(',\n');

    const jsCode = `// scrapedWuwaBanners.js
// Auto-generated by scrapeWuwaBanners.js
// Last updated: ${new Date().toISOString()}

export const scrapedWuwaBanners = [
${bannersCode}
];
`;

    // Write to file
    const outputPath = path.join(__dirname, '..', 'src', 'data', 'scrapedWuwaBanners.js');
    const existingImageMap = await loadExistingImages(outputPath, 'scrapedWuwaBanners');

    const bannersCodeFinal = processedBanners.map(banner => {
      const img = resolveImage(banner.image, banner.title, existingImageMap);
      return `  {
    title: '${banner.title.replace(/'/g, "\\'")}',
    start: new Date('${banner.start}'),
    end: new Date('${banner.end}'),
    image: '${img.replace(/'/g, "\\'")}',
    description: \`${banner.description.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`,
    game: '${banner.game}',
    type: '${banner.type}',
  }`;
    }).join(',\n');

    const jsCodeFinal = `// scrapedWuwaBanners.js
// Auto-generated by scrapeWuwaBanners.js
// Last updated: ${new Date().toISOString()}

export const scrapedWuwaBanners = [
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

scrapeWuwaBanners();
