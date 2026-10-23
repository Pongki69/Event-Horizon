// scrapeGenshinBanners.js
// Script to scrape Genshin Impact banners from Game8 with wiki API enhancements
// Run with: node scripts/scrapeGenshinBanners.js

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { downloadImage, loadExistingImages, resolveImage, setupRequestInterception } from './archiveUtils.js';

puppeteer.use(StealthPlugin());

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
  const dateMatch = dateText.match(/([A-Za-z]+)\.?\s+(\d{1,2}),\s+(\d{4})/);
  
  if (dateMatch) {
    const [, monthName, day, year] = dateMatch;
    const month = monthToIndex(monthName);

    let parsedYear = parseInt(year);
    const currentYear = new Date().getFullYear();
    if (parsedYear > currentYear + 5) {
      const yearStr = String(parsedYear);
      const fixed = yearStr[0] + yearStr[2] + yearStr[1] + yearStr[3];
      const fixedYear = parseInt(fixed);
      if (fixedYear >= currentYear - 1 && fixedYear <= currentYear + 5) {
        console.log(`  ⚠️  Year ${parsedYear} looks like a typo, correcting to ${fixedYear}`);
        parsedYear = fixedYear;
      }
    }
    
    if (isEndDate) {
      return Date.UTC(parsedYear, month, parseInt(day), 6, 59, 0);
    } else {
      return Date.UTC(parsedYear, month, parseInt(day), 3, 0, 0);
    }
  }
  
  return null;
}

/**
 * Fetch image from wiki API
 */
async function fetchWikiImage(name, isWeapon = false) {
  try {
    const candidates = isWeapon 
      ? [`${name}.png`, `Weapon_${name}.png`]
      : [`${name}_Splash_Art.png`, `${name}_Card.png`];
    
    for (const filename of candidates) {
      const apiUrl = `https://genshin-impact.fandom.com/api.php?action=query&titles=File:${encodeURIComponent(filename)}&prop=imageinfo&iiprop=url&format=json&origin=*`;
      const res = await fetch(apiUrl);
      if (!res.ok) continue;
      const json = await res.json();
      const page = Object.values(json?.query?.pages || {})[0];
      if (page?.imageinfo?.[0]?.url) {
        return page.imageinfo[0].url.split('/revision')[0];
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch description from wiki API - gets profile text
 */
async function fetchWikiDescription(name, isWeapon = false) {
  try {
    const pageName = isWeapon ? name : `${name}/Profile`;
    
    // Use parse API to get the Profile page content
    const apiUrl = `https://genshin-impact.fandom.com/api.php?action=parse&page=${encodeURIComponent(pageName)}&prop=text&section=0&format=json&origin=*`;
    const res = await fetch(apiUrl);
    const json = await res.json();
    const html = json?.parse?.text?.['*'] || '';
    
    if (!html) return '';
    
    // Look for the profile text section - usually after "In-game character attributes and profile page text"
    // The text is in a blockquote or after specific headers
    
    // Try to find blockquote with the profile description
    const blockquoteMatch = html.match(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/i);
    if (blockquoteMatch) {
      let description = blockquoteMatch[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&#91;/g, '[')
        .replace(/&#93;/g, ']')
        .replace(/\[[0-9]+\]/g, '') // Remove reference numbers
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/—Description from the Official Website/gi, '') // Remove official website attribution
        .replace(/\s+/g, ' ')
        .trim();
      
      if (description.length > 0) {
        return description;
      }
    }
    
    // Fallback: look for paragraph with character description
    const paragraphMatch = html.match(/<p[^>]*>((?:(?!<\/p>).)*?playable.*?character.*?<\/p>)/is);
    if (paragraphMatch) {
      let description = paragraphMatch[1]
        .replace(/<[^>]+>/g, '')
        .replace(/\[[^\]]+\]/g, '')
        .replace(/&#91;/g, '[')
        .replace(/&#93;/g, ']')
        .replace(/\[[0-9]+\]/g, '')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Limit to first 2 sentences
      const sentences = description.match(/[^.!?]+[.!?]+/g) || [description];
      if (sentences.length > 2) {
        description = sentences.slice(0, 2).join(' ');
      }
      
      return description;
    }
    
    return '';
  } catch (error) {
    console.log(`  Error fetching description: ${error.message}`);
    return '';
  }
}

async function scrapeGenshinBanners() {
  console.log('Fetching banners from Game8...');
  console.log('Environment:', process.env.CI ? 'GitHub Actions' : 'Local');

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--window-size=1920,1080',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ]
  });

  try {
    const page = await browser.newPage();
    
    // Enable console logging from page evaluate
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    
    // Set realistic viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Use more recent Chrome version
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    await page.setUserAgent(userAgent);
    console.log('User-Agent:', userAgent);
    
    // Set additional headers that real browsers send
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0'
    });
    
    // Log all responses with detailed debugging for errors
    page.on('response', async response => {
      const url = response.url();
      const status = response.status();
      
      if (url.includes('game8.co')) {
        console.log(`Response: ${status} ${url}`);
        
        // Log detailed information for error responses
        if (status >= 400) {
          console.log(`  ❌ Error response detected`);
          console.log(`  Status: ${status}`);
          console.log(`  URL: ${url}`);
          
          const headers = response.headers();
          console.log(`  Response headers:`, JSON.stringify(headers, null, 2));
          
          const contentType = headers['content-type'] || 'unknown';
          console.log(`  Content-Type: ${contentType}`);
          
          // Try to get response body (limited to first 500 chars)
          try {
            const body = await response.text();
            const preview = body.substring(0, 500);
            console.log(`  Response body preview (first 500 chars):`);
            console.log(preview);
            
            // Check for Cloudflare indicators
            if (body.toLowerCase().includes('cloudflare')) {
              console.log(`  ⚠️  Response contains 'cloudflare' keyword`);
            }
            if (body.toLowerCase().includes('challenge')) {
              console.log(`  ⚠️  Response contains 'challenge' keyword`);
            }
          } catch (e) {
            console.log(`  Could not read response body: ${e.message}`);
          }
        }
      }
    });
    
    // Log failed requests
    page.on('requestfailed', request => {
      console.log(`Request failed: ${request.url()} - ${request.failure().errorText}`);
    });
    
    // Setup request interception to block ads and analytics
    await setupRequestInterception(page);
    console.log('✓ Request interception enabled (blocking ads/analytics)');
    
    // Add random delay before navigation (human-like behavior)
    const randomDelay = Math.floor(Math.random() * 2000) + 1000;
    console.log(`Waiting ${randomDelay}ms before navigation...`);
    await new Promise(resolve => setTimeout(resolve, randomDelay));

    console.log('Navigating to Game8...');
    const response = await page.goto('https://game8.co/games/Genshin-Impact/archives/305012', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    const finalStatus = response.status();
    const finalUrl = response.url();
    const currentPageUrl = page.url();
    
    console.log(`Navigation complete:`);
    console.log(`  Initial response status: ${finalStatus}`);
    console.log(`  Initial response URL: ${finalUrl}`);
    console.log(`  Current page URL: ${currentPageUrl}`);
    
    if (finalUrl !== currentPageUrl) {
      console.log(`  ⚠️  URL changed during navigation (redirect detected)`);
    }
    
    if (finalStatus === 403) {
      console.log('❌ Received 403 Forbidden from Game8');
      const headers = response.headers();
      console.log('Main response headers:', JSON.stringify(headers, null, 2));
      
      try {
        const body = await response.text();
        console.log('Response body length:', body.length);
        if (body.includes('cloudflare') || body.includes('Cloudflare')) {
          console.log('⚠️  Cloudflare challenge detected in response body');
        }
        if (body.includes('403') || body.includes('Forbidden')) {
          console.log('⚠️  403/Forbidden keywords found in body');
        }
      } catch (e) {
        console.log('Could not read response body:', e.message);
      }
      
      throw new Error('403 Forbidden - likely IP/network-based blocking by Game8/Cloudflare');
    }
    
    console.log('✓ Page loaded successfully, extracting banner data...');
    
    await page.waitForSelector('body', { timeout: 10000 });
    
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

    // Extract banner data
    const banners = await page.evaluate(() => {
      const bannerData = [];
      const seen = new Set();
      
      const tables = document.querySelectorAll('table');
      
      for (const table of tables) {
        const tableText = table.textContent;
        const hasBannerDates = tableText.includes('Banner Dates');
        const has5StarRateUp = tableText.includes('5 Star Rate-Up');
        
        if (!hasBannerDates || !has5StarRateUp) {
          continue;
        }
        
        const rows = table.querySelectorAll('tr');
        
        for (const row of rows) {
          const text = row.textContent;
          
          if (!text.includes('Banner Dates') || !text.includes('5 Star Rate-Up')) {
            continue;
          }
          
          // Extract dates
          const dateMatch = text.match(/Banner Dates?:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})\s*-\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/);
          if (!dateMatch) continue;
          
          const [, startDate, endDate] = dateMatch;
          
          // Check for character or weapon banner
          const isWeaponBanner = text.includes('Epitome Invocation') || text.includes('Weapon Rate-Up');
          
          if (isWeaponBanner) {
            // Parse weapon banner - extract weapon names from links
            const allLinks = Array.from(row.querySelectorAll('a'));
            const weaponNames = [];
            
            for (const link of allLinks) {
              const weaponName = link.textContent.trim();
              const href = link.getAttribute('href') || '';
              
              // Accept links that go to genshin wiki or archives  
              const isWeaponLink = href.includes('/wiki/') || href.includes('/archives/');
              
              if (isWeaponLink &&
                  weaponName &&
                  weaponName.length >= 3 &&
                  weaponName.length <= 40 &&
                  !weaponName.match(/\d+ Star/) && // Skip "4 Star", "5 Star" text
                  !weaponName.includes('Banner') &&
                  !weaponName.includes('Invocation') &&
                  !weaponName.includes('Version') &&
                  !weaponName.includes('Phase') &&
                  !weaponName.includes('Rate-Up') &&
                  !weaponName.includes('Wish') &&
                  !weaponName.includes('The Flute') && // Common 4-star weapon
                  !weaponName.includes('Favonius') && // 4-star weapon family
                  !weaponName.includes('Eye of Perception') && // 4-star weapon
                  !weaponName.includes('Stringless')) { // 4-star weapon
                weaponNames.push(weaponName);
              }
            }
            
            // Deduplicate 
            const uniqueWeapons = [...new Set(weaponNames)];
            
            if (uniqueWeapons.length > 0) {
                const key = `weapon-${uniqueWeapons.join('-')}-${startDate}`;
                if (!seen.has(key)) {
                  seen.add(key);
                  
                  const now = new Date();
                  const start = new Date(startDate);
                  const type = start > now ? 'upcoming' : 'test-run';
                  
                  bannerData.push({
                    name: uniqueWeapons.join(' & '),
                    weapons: uniqueWeapons,
                    startDate,
                    endDate,
                    type,
                    isWeapon: true,
                    rarity: 5
                  });
                }
              }
          } else {
            // Parse character banner
            const charMatch = text.match(/5 Star Rate-Up:\s*([A-Za-z\s]+?)(?:\n|4 Star|Banner|Version|$)/);
            if (!charMatch) continue;
            
            const characterName = charMatch[1].trim();
            if (!characterName || characterName.length < 2) continue;
            
            const key = `char-${characterName}-${startDate}`;
            if (seen.has(key)) continue;
            seen.add(key);
            
            const now = new Date();
            const start = new Date(startDate);
            const type = start > now ? 'upcoming' : 'test-run';
            
            // Extract signature weapon
            let signatureWeapon = '';
            const weaponMatch = text.match(/5 Star Weapon Rate-Up:\s*([A-Za-z\s',]+?)(?:\n|4 Star|Banner|Version|$)/);
            if (weaponMatch) {
              const weaponNames = weaponMatch[1].split(/\s*,\s*/).map(w => w.trim()).filter(w => w.length > 2);
              if (weaponNames.length > 0) {
                signatureWeapon = weaponNames[0]; // First weapon is usually the signature
              }
            }
            
            bannerData.push({
              name: characterName,
              characters: [characterName],
              signatureWeapon: signatureWeapon,
              startDate,
              endDate,
              type,
              isWeapon: false,
              rarity: 5
            });
          }
        }
      }
      
      // Look for upcoming character teasers in "Next Banners Schedule" section
      const headings = document.querySelectorAll('h2, h3, h4');
      for (const heading of headings) {
        const headingText = heading.textContent.trim();
        
        // Look for "Next Banners Schedule" heading
        if (headingText.match(/next.*banner.*schedule/i)) {
          console.log(`Found upcoming banner section: ${headingText}`);
          
          // Look for the subheading mentioning character names (e.g., "Vesna and Vodyanitsa of Version 7.1")
          let el = heading.nextElementSibling;
          let iterCount = 0;
          const upcomingChars = [];
          
          while (el && iterCount < 20) {
            iterCount++;
            
            // Stop if we hit another H2
            if (el.tagName === 'H2') break;
            
            const elemText = el.textContent || '';
            
            // Check for pattern: "CharName and CharName of Version X.X"
            const versionMatch = elemText.match(/([A-Z][a-z]+)\s+and\s+([A-Z][a-z]+)\s+of\s+Version\s+\d+\.\d+/i);
            if (versionMatch) {
              const char1 = versionMatch[1];
              const char2 = versionMatch[2];
              console.log(`Found upcoming characters in text: ${char1}, ${char2}`);
              if (!upcomingChars.includes(char1)) upcomingChars.push(char1);
              if (!upcomingChars.includes(char2)) upcomingChars.push(char2);
            }
            
            // Also look for character links in tables with "Character Banners" header
            if (elemText.includes('Character Banners')) {
              const charLinks = el.querySelectorAll('a[href*="/archives/"]');
              for (const link of charLinks) {
                const charName = link.textContent.trim();
                if (charName &&
                    charName.length >= 3 &&
                    charName.length <= 20 &&
                    charName.match(/^[A-Z][a-z]+$/) &&
                    !upcomingChars.includes(charName)) {
                  console.log(`Found upcoming character in table: ${charName}`);
                  upcomingChars.push(charName);
                }
              }
            }
            
            el = el.nextElementSibling;
          }
          
          console.log(`Total upcoming characters found: ${upcomingChars.length} - ${upcomingChars.join(', ')}`);
          
          // Add each upcoming character as a banner with estimated dates
          for (const charName of upcomingChars) {
            const key = `char-${charName}-upcoming`;
            if (!seen.has(key)) {
              seen.add(key);
              
              // Estimate dates based on typical 3-week banner cycle
              const lastBanner = bannerData[bannerData.length - 1];
              let estimatedStart = 'TBA';
              let estimatedEnd = 'TBA';
              
              if (lastBanner && lastBanner.endDate) {
                const lastEnd = new Date(lastBanner.endDate);
                const nextStart = new Date(lastEnd);
                nextStart.setDate(nextStart.getDate() + 1);
                const nextEnd = new Date(nextStart);
                nextEnd.setDate(nextEnd.getDate() + 21);
                
                estimatedStart = nextStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
                estimatedEnd = nextEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
              }
              
              bannerData.push({
                name: charName,
                characters: [charName],
                signatureWeapon: '',
                startDate: estimatedStart,
                endDate: estimatedEnd,
                type: 'upcoming',
                isWeapon: false,
                rarity: 5,
                isTBA: estimatedStart === 'TBA'
              });
            }
          }
        }
      }
      
      return bannerData;
    });

    console.log(`Found ${banners.length} banners`);

    // Process each banner
    const processedBanners = [];
    
    for (const banner of banners) {
      console.log(`\nProcessing: ${banner.name} (${banner.rarity}★ ${banner.isWeapon ? 'weapon' : 'character'})`);
      
      let startDate, endDate;
      
      if (banner.isTBA) {
        // For TBA banners, use a far future date as placeholder
        startDate = Date.now() + (90 * 24 * 60 * 60 * 1000); // 90 days from now
        endDate = startDate + (21 * 24 * 60 * 60 * 1000); // +21 days
        console.log(`  ℹ TBA banner - using estimated future dates`);
      } else {
        startDate = parseBannerDate(banner.startDate, false);
        endDate = parseBannerDate(banner.endDate, true);
      }
      
      if (!startDate || !endDate) {
        console.log(`  ✗ Skipping: invalid dates`);
        continue;
      }
      
      const isWeapon = banner.isWeapon;
      
      // For weapon banners, create separate entries for each weapon
      if (isWeapon && banner.weapons && banner.weapons.length > 0) {
        for (const weaponName of banner.weapons) {
          console.log(`  Processing weapon: ${weaponName}`);
          
          // Fetch image from wiki
          let localImage = '';
          const imageUrl = await fetchWikiImage(weaponName, true);
          if (imageUrl) {
            console.log(`    ✓ Found wiki image`);
            localImage = await downloadImage(imageUrl, 'genshin-impact', weaponName, 'banners');
            if (localImage) console.log(`    ✓ Saved: ${localImage}`);
          }
          
          // Fetch description from wiki
          let description = await fetchWikiDescription(weaponName, true);
          if (!description) {
            console.log(`    ⚠ No wiki description found, using fallback`);
            description = `${weaponName} weapon banner.`;
          } else {
            console.log(`    ✓ Description: ${description.substring(0, 80)}...`);
          }
          
          // Create wiki URL
          const wikiName = weaponName.replace(/\s+/g, '_');
          const wikiUrl = `https://genshin-impact.fandom.com/wiki/${wikiName}`;
          
          processedBanners.push({
            title: weaponName,
            start: new Date(startDate).toISOString(),
            end: new Date(endDate).toISOString(),
            image: localImage || '',
            type: banner.type,
            rarity: banner.rarity,
            bannerType: 'weapon',
            game: 'Genshin Impact',
            description,
            wikiUrl
          });
        }
      } else {
        // Character banner - process normally
        const primaryName = banner.characters[0];
        console.log(`  Processing character: ${primaryName}`);
        
        // Fetch image from wiki
        let localImage = '';
        const imageUrl = await fetchWikiImage(primaryName, false);
        if (imageUrl) {
          console.log(`    ✓ Found wiki image`);
          localImage = await downloadImage(imageUrl, 'genshin-impact', primaryName, 'banners');
          if (localImage) console.log(`    ✓ Saved: ${localImage}`);
        }
        
        // Fetch description from wiki
        let description = await fetchWikiDescription(primaryName, false);
        if (!description) {
          console.log(`    ⚠ No wiki description found, using fallback`);
          description = `${banner.name} character banner.`;
        } else {
          console.log(`    ✓ Description: ${description.substring(0, 80)}...`);
        }
        
        // Create wiki URL
        const wikiName = primaryName.replace(/\s+/g, '_');
        const wikiUrl = `https://genshin-impact.fandom.com/wiki/${wikiName}`;
        
        processedBanners.push({
          title: banner.name,
          start: new Date(startDate).toISOString(),
          end: new Date(endDate).toISOString(),
          image: localImage || '',
          type: banner.type,
          rarity: banner.rarity,
          bannerType: 'character',
          game: 'Genshin Impact',
          description,
          wikiUrl
        });
      }
    }

    console.log(`\nProcessed ${processedBanners.length} total banner entries`);

    await browser.close();

    // Write to file
    const outputPath = path.join(__dirname, '..', 'src', 'data', 'scrapedGenshinBanners.js');
    const existingImageMap = await loadExistingImages(outputPath, 'scrapedGenshinBanners');

    const bannersCode = processedBanners.map(banner => {
      const img = resolveImage(banner.image, banner.title, existingImageMap);
      return `  {
    title: '${banner.title.replace(/'/g, "\\'")}',
    start: new Date('${banner.start}'),
    end: new Date('${banner.end}'),
    image: '${img.replace(/'/g, "\\'")}',
    type: '${banner.type}',
    rarity: ${banner.rarity},
    bannerType: '${banner.bannerType}',
    game: '${banner.game}',
    description: '${banner.description.replace(/'/g, "\\'")}',
    wikiUrl: ${JSON.stringify(banner.wikiUrl)},
  }`;
    }).join(',\n');

    const jsCode = `// scrapedGenshinBanners.js
// Auto-generated by scrapeGenshinBanners.js
// Last updated: ${new Date().toISOString()}

export const scrapedGenshinBanners = [
${bannersCode}
];
`;

    fs.writeFileSync(outputPath, jsCode);

    console.log(`\n✅ Saved to: ${outputPath}`);
    console.log(`📊 Total: ${processedBanners.length} banners`);

  } catch (error) {
    console.error('Error during scraping:', error);
    await browser.close();
    process.exit(1);
  }
}

scrapeGenshinBanners();
