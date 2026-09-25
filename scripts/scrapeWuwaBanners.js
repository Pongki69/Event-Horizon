// scrapeWuwaBanners.js
// Scraper for Wuthering Waves banners
// Run with: node scripts/scrapeWuwaBanners.js

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { downloadImage, loadExistingImages, resolveImage, setupRequestInterception } from './archiveUtils.js';

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
  // Handle formats like "September 30, 2026" or "Sept. 30, 2026"
  const dateMatch = dateStr.match(/([A-Za-z]+)\.?\s+(\d{1,2}),\s+(\d{4})/);
  if (!dateMatch) return null;
  const [, monthName, day, year] = dateMatch;
  // Remove any trailing period from month name
  const cleanMonthName = monthName.replace(/\.$/, '');
  const month = monthToIndex(cleanMonthName);
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

    // Setup request interception to block ads and analytics
    await setupRequestInterception(page);
    console.log('✓ Request interception enabled (blocking ads/analytics)');

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
        // Also match "Signature Weapons" sections  
        const matchesSignatureWeapons = text.includes('Signature Weapon');
        
        if (matchesCurrent || matchesUpcoming || matchesSignatureWeapons) {
          // Signature weapons are upcoming if they're in an "Upcoming" page context
          const isUpcoming = text.includes('Upcoming') || matchesSignatureWeapons;
          sectionsToProcess.push({ heading, isUpcoming, isSignatureWeapons: matchesSignatureWeapons });
        }
      }

      // Each h2/h3 section can contain multiple tables
      for (const { heading, isUpcoming, isSignatureWeapons } of sectionsToProcess) {
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

              // Second cell: featured characters/weapons
              const characterCell = cells[1];
              const cellText = characterCell.textContent;
              
              // For signature weapons sections, extract all weapon names regardless of rarity
              if (isSignatureWeapons) {
                // Check if first cell contains date info (e.g., "Part 1 (Sept. 30 - Oct. 22, 2026)")
                const firstCellText = bannerCell.textContent.trim();
                const dateMatch = firstCellText.match(/\(([^)]+\d{4})\)/);
                if (dateMatch) {
                  durationText = dateMatch[1]; // Extract date from parentheses
                }
                
                const links = characterCell.querySelectorAll('a');
                const weaponNames = Array.from(links)
                  .map(link => link.textContent.trim())
                  .filter(name => name.length > 1 && name.length < 50 && !name.includes('(Sept') && !name.includes('(Oct'));
                
                for (const weaponName of weaponNames) {
                  bannerList.push({
                    characterName: weaponName,
                    imageUrl,
                    durationText,
                    isUpcoming
                  });
                }
                continue;
              }
              
              // For regular character banners, check for 5★
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

      // AFTER processing all tables, check for future version announcements
      // Look for sections like "Likely Hsin and Suoming" where character names are links
      
      // COMPREHENSIVE FUTURE BANNER DETECTION
      // Strategy: Parse heading text and scan content for character name patterns AND dates
      
      const futureHeadings = document.querySelectorAll('h2, h3');
      let foundUpcoming = false;
      const potentialCharacters = new Set();
      const characterDates = {}; // Store dates per character
      
      for (const heading of futureHeadings) {
        const headingText = heading.textContent.trim();
        
        // Look for "Upcoming" headings
        if (headingText.toLowerCase().includes('upcoming') ||
            headingText.toLowerCase().includes('likely') ||
            headingText.toLowerCase().includes('multiple rerun')) {
          
          foundUpcoming = true;
          
          // Extract character names from the heading itself
          let cleanHeading = headingText
            .replace(/with Multiple Reruns?/gi, '')
            .replace(/Upcoming/gi, '')
            .replace(/Likely/gi, '')
            .replace(/Banners?/gi, '')
            .replace(/New/gi, '')
            .replace(/Releases?/gi, '')
            .replace(/Wuthering Waves/gi, '')
            .replace(/\s+in\s+/gi, ' ')
            .trim();
          
          const headingCharNames = cleanHeading
            .split(/\s+and\s+/i)
            .map(name => name.trim())
            .filter(name => name.length >= 3 && name.length <= 20 &&
                          name.match(/^[A-Z][a-z]+$/) &&
                          !name.toLowerCase().match(/version|banner|signature|weapon|phase|part|event|waves/));
          
          for (const charName of headingCharNames) {
            if (charName.length > 0) {
              potentialCharacters.add(charName);
            }
          }
          
          // Scan content for: 1) Phase sections with dates, 2) Character name lists
          let elem = heading.nextElementSibling;
          let depth = 0;
          const phaseDateMap = {}; // Map phase numbers to their dates
          const characterList = []; // Track all mentioned character names in order
          
          // First pass: Extract Phase dates and collect all character names mentioned
          while (elem && depth < 60) {
            if (elem.tagName === 'H2') break;
            
            const elemText = elem.textContent || '';
            
            // Capture Phase sections with dates
            // Try multiple formats: "Phase 1 Banners (dates)" or "Phase 1 (dates)"
            let phaseMatch = elemText.match(/Phase\s+(\d+)\s+Banners?\s*\(([^)]+)\)/i);
            if (!phaseMatch) {
              phaseMatch = elemText.match(/Phase\s+(\d+)\s*\(([^)]+)\)/i);
            }
            if (phaseMatch) {
              phaseDateMap[phaseMatch[1]] = phaseMatch[2];
            }
            
            // Pattern 1: "CharName Banner" or "CharName Rerun Banner"
            const bannerMatches = elemText.matchAll(/([A-Z][a-z]+)\s+(?:Rerun\s+)?Banner/gi);
            for (const match of bannerMatches) {
              const charName = match[1];
              if (charName.length >= 3 && charName.length <= 20 &&
                  !charName.toLowerCase().match(/convene|weapon|featured|absolute|pulsation|version|phase|signature|brume|release|date/)) {
                if (!characterList.includes(charName)) {
                  characterList.push(charName);
                }
              }
            }
            
            // Pattern 2: "like CharName, CharName, and CharName"
            const likePattern = elemText.match(/(?:like|including|featuring)\s+([A-Z][a-z]+(?:,?\s+(?:and\s+)?[A-Z][a-z]+)*)/i);
            if (likePattern) {
              const names = likePattern[1]
                .split(/,?\s+(?:and\s+)?/)
                .map(n => n.replace(/,/g, '').trim())
                .filter(n => n.length >= 3 && n.length <= 20 && n.match(/^[A-Z][a-z]+$/) &&
                            !n.toLowerCase().match(/version|release|date/));
              
              for (const charName of names) {
                if (!characterList.includes(charName)) {
                  characterList.push(charName);
                }
              }
            }
            
            elem = elem.nextElementSibling;
            depth++;
          }
          
          // Second pass: Assign dates to characters
          // If we found exactly 2 phases and 4+ characters, split them evenly
          if (Object.keys(phaseDateMap).length === 2 && characterList.length >= 4) {
            const phase1Date = phaseDateMap['1'];
            const phase2Date = phaseDateMap['2'];
            
            // Heuristic: First half of characters go to Phase 1, second half to Phase 2
            const midpoint = Math.ceil(characterList.length / 2);
            
            for (let i = 0; i < characterList.length; i++) {
              const charName = characterList[i];
              potentialCharacters.add(charName);
              characterDates[charName] = i < midpoint ? phase1Date : phase2Date;
            }
          } else if (characterList.length >= 4) {
            // Fallback: Use Phase 1 date, but assign specific characters to Phase 2
            // Known Phase 2 characters: Suoming, Lynae, Lucilla
            const phase1Date = phaseDateMap['1'] || Object.values(phaseDateMap)[0];
            const phase2Characters = ['Suoming', 'Lynae', 'Lucilla'];
            
            // Try to detect Phase 2 date from the text (Oct 22 - Nov 10)
            let phase2Date = null;
            const phase2Match = phase1Date?.match(/([A-Za-z]+\.?\s+\d{1,2},\s+\d{4})\s*[-–]\s*([A-Za-z]+\.?\s+\d{1,2},\s+\d{4})/);
            if (phase2Match) {
              const phase1End = phase2Match[2]; // e.g., "October 22, 2026"
              // Construct Phase 2: "October 22, 2026 - November 10, 2026"
              // Use known duration (19 days)
              const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
              const endMatch = phase1End.match(/([A-Za-z]+)\.?\s+(\d{1,2}),\s+(\d{4})/);
              if (endMatch) {
                const endMonth = endMatch[1].replace(/\.$/, '');
                const endDay = parseInt(endMatch[2]);
                const endYear = parseInt(endMatch[3]);
                const endMonthIdx = months.findIndex(m => m.startsWith(endMonth));
                
                // Add 19 days for Phase 2 end
                const tempDate = new Date(Date.UTC(endYear, endMonthIdx, endDay));
                tempDate.setUTCDate(tempDate.getUTCDate() + 19);
                const newMonth = months[tempDate.getUTCMonth()];
                const newDay = tempDate.getUTCDate();
                
                phase2Date = `${phase1End} - ${newMonth} ${newDay}, ${endYear}`;
              }
            }
            
            for (const charName of characterList) {
              potentialCharacters.add(charName);
              // Assign Phase 2 date to known Phase 2 characters
              if (phase2Date && phase2Characters.includes(charName)) {
                characterDates[charName] = phase2Date;
              } else if (phase1Date) {
                characterDates[charName] = phase1Date;
              }
            }
          } else {
            // Final fallback: Add all characters with first available date
            const firstDate = Object.values(phaseDateMap)[0] || null;
            for (const charName of characterList) {
              potentialCharacters.add(charName);
              if (firstDate) {
                characterDates[charName] = firstDate;
              }
            }
          }
        }
      }
      
      // Add found characters as future banners with their dates
      if (foundUpcoming && potentialCharacters.size > 0) {
        for (const charName of potentialCharacters) {
          const durationText = characterDates[charName] || 'Date TBA';
          
          bannerList.push({
            characterName: charName,
            imageUrl: '',
            durationText: durationText,
            isUpcoming: true,
            isFuture: true
          });
        }
      }
      
      // Pattern 2: Fallback - look for bold/strong names with version mentions in paragraphs
      if (!bannerList.some(b => b.isFuture)) {
        const paragraphs = document.querySelectorAll('p');
        
        for (const p of paragraphs) {
          const text = p.textContent || '';
          const strongTags = p.querySelectorAll('strong, b, a');
          const strongNames = Array.from(strongTags).map(tag => tag.textContent.trim()).filter(name => name.length > 0 && name.length < 20);
          const versionMatch = text.match(/Version\s+(\d+\.\d+)/i);
          
          if (strongNames.length >= 2 && versionMatch && text.toLowerCase().includes(' and ')) {
            const char1 = strongNames[0];
            const char2 = strongNames[1];
            const version = versionMatch[1];
            
            if (text.toLowerCase().includes('featured') || text.toLowerCase().includes('banner')) {
              bannerList.push({
                characterName: char1.trim(),
                imageUrl: '',
                durationText: `Version ${version} (Date TBA)`,
                isUpcoming: true,
                isFuture: true
              });
              
              bannerList.push({
                characterName: char2.trim(),
                imageUrl: '',
                durationText: `Version ${version} (Date TBA)`,
                isUpcoming: true,
                isFuture: true
              });
              
              break;
            }
          }
        }
      }

      return bannerList;
    });

    console.log(`Found ${banners.length} banners`);
    
    // Check if any future banners were detected
    const futureBanners = banners.filter(b => b.isFuture);
    if (futureBanners.length > 0) {
      console.log(`\n🔮 Detected ${futureBanners.length} future unannounced banners:`);
      futureBanners.forEach(b => console.log(`   - ${b.characterName} (${b.durationText})`));
    }

    // Process each banner
    const processedBanners = [];
    
    for (const banner of banners) {
      console.log(`\n  Banner: ${banner.characterName}`);
      console.log(`    Duration text: ${banner.durationText.replace(/\n/g, ' ').substring(0, 80)}`);

      // Handle future unannounced banners (no dates yet)
      if (banner.isFuture) {
        console.log(`    Type: future (${banner.durationText})`);
        
        // Try to fetch character splash art (API first)
        let splashImageUrl = null;
        try {
          const resolvedUrl = await resolveWuwaWikiImage(banner.characterName, null);
          if (resolvedUrl) {
            splashImageUrl = resolvedUrl;
            console.log(`    ✓ Resolved splash art for future banner (API)`);
          }
        } catch (err) {
          console.log(`    ⚠ Could not resolve splash art via API: ${err.message}`);
        }
        
        // Fallback: Direct wiki page scraping
        if (!splashImageUrl) {
          console.log(`    ⚠ Trying direct wiki page scraping for future banner...`);
          try {
            const wikiUrl = `https://wutheringwaves.fandom.com/wiki/${encodeURIComponent(banner.characterName)}`;
            const wikiPage = await browser.newPage();
            await wikiPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
            await wikiPage.goto(wikiUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            
            // Wait a bit for images to load
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Wait for and extract the thumbnail image
            await wikiPage.waitForSelector('img.pi-image-thumbnail', { timeout: 10000 }).catch(() => {});
            
            const imageUrl = await wikiPage.evaluate(() => {
              const img = document.querySelector('img.pi-image-thumbnail');
              if (img && img.src) {
                return img.src.split('/revision')[0];
              }
              return null;
            });
            
            if (imageUrl) {
              splashImageUrl = imageUrl;
              console.log(`    ✓ Found character thumbnail via scraping`);
            } else {
              console.log(`    ✗ No thumbnail found on wiki page`);
            }
            
            await wikiPage.close();
          } catch (scrapeErr) {
            console.log(`    ✗ Wiki page scraping failed: ${scrapeErr.message}`);
          }
        }
        
        // Download the image if found
        let localImage = '';
        if (splashImageUrl) {
          localImage = await downloadImage(splashImageUrl, 'wuthering-waves', banner.characterName, 'banners');
          if (localImage) console.log(`    ✓ Image saved: ${localImage}`);
        }

        // Try to parse dates from durationText if available
        let startDate = 'TBA';
        let endDate = 'TBA';
        
        if (banner.durationText && banner.durationText !== 'Date TBA') {
          // Try to parse dates using same logic as other banners
          const durationMatch = banner.durationText.match(/([A-Za-z]+\.?\s+\d{1,2},\s+\d{4})\s*[-–]\s*([A-Za-z]+\.?\s+\d{1,2},\s+\d{4})/);
          
          if (durationMatch) {
            const [, startStr, endStr] = durationMatch;
            const parsedStartUTC = parseWuwaDate(startStr);
            const parsedEndUTC = parseWuwaDate(endStr);
            
            if (parsedStartUTC && parsedEndUTC && !isNaN(parsedStartUTC) && !isNaN(parsedEndUTC)) {
              startDate = new Date(parsedStartUTC).toISOString();
              endDate = new Date(parsedEndUTC).toISOString();
            }
          }
        }

        processedBanners.push({
          title: banner.characterName,
          start: startDate,
          end: endDate,
          image: localImage, 
          description: startDate === 'TBA' 
            ? `${banner.characterName} is an upcoming character. Release date to be announced.`
            : `${banner.characterName} is coming soon!`,
          game: 'Wuthering Waves',
          type: startDate === 'TBA' ? 'future' : 'upcoming'
        });
        
        continue; // Skip normal date processing
      }

      // Parse duration — handles multiple formats:
      //   "Banner Countdown:\nJuly 30, 2026 - August 19, 2026\n..."  (current)
      //   "Banner Start:\nAugust 20, 2026 - September 10, 2026"       (upcoming)
      //   "Sept. 30 - Oct. 22, 2026"                                   (signature weapons)
      
      // Try full format first: "Month Day, Year - Month Day, Year"
      let durationMatch = banner.durationText.match(/([A-Za-z]+\.?\s+\d{1,2},\s+\d{4})\s*[-–]\s*([A-Za-z]+\.?\s+\d{1,2},\s+\d{4})/);
      
      // If that didn't match, try shortened format: "Month. Day - Month. Day, Year"
      if (!durationMatch) {
        const shortMatch = banner.durationText.match(/([A-Za-z]+\.?)\s+(\d{1,2})\s*[-–]\s*([A-Za-z]+\.?)\s+(\d{1,2}),\s+(\d{4})/);
        if (shortMatch) {
          const [, startMonth, startDay, endMonth, endDay, year] = shortMatch;
          // Reconstruct as full format
          const startDateStr = `${startMonth} ${startDay}, ${year}`;
          const endDateStr = `${endMonth} ${endDay}, ${year}`;
          durationMatch = [null, startDateStr, endDateStr];
        }
      }

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
            console.log(`    ✗ No image found on wiki API`);
          }
        } catch (imgErr) {
          console.log(`    ✗ Wiki image fetch failed: ${imgErr.message}`);
        }
      }
      
      // Fallback 2: Scrape wiki page directly for character thumbnail
      if (!localImage) {
        console.log(`    ⚠ Trying direct wiki page scraping...`);
        try {
          const wikiUrl = `https://wutheringwaves.fandom.com/wiki/${encodeURIComponent(banner.characterName)}`;
          const wikiPage = await browser.newPage();
          await wikiPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
          await wikiPage.goto(wikiUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
          
          // Wait a bit for images to load
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Wait for and extract the thumbnail image
          await wikiPage.waitForSelector('img.pi-image-thumbnail', { timeout: 10000 }).catch(() => {});
          
          const imageUrl = await wikiPage.evaluate(() => {
            const img = document.querySelector('img.pi-image-thumbnail');
            if (img && img.src) {
              return img.src.split('/revision')[0];
            }
            return null;
          });
          
          if (imageUrl) {
            console.log(`    ✓ Found character thumbnail on wiki page`);
            localImage = await downloadImage(imageUrl, 'wuthering-waves', banner.characterName, 'banners');
            if (localImage) console.log(`    ✓ Image saved: ${localImage}`);
          } else {
            console.log(`    ✗ No thumbnail found on wiki page`);
          }
          
          await wikiPage.close();
        } catch (scrapeErr) {
          console.log(`    ✗ Wiki page scraping failed: ${scrapeErr.message}`);
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
      // Handle TBA dates - don't wrap in new Date()
      const startValue = banner.start === 'TBA' ? "'TBA'" : `new Date('${banner.start}')`;
      const endValue = banner.end === 'TBA' ? "'TBA'" : `new Date('${banner.end}')`;
      
      return `  {
    title: '${banner.title.replace(/'/g, "\\'")}',
    start: ${startValue},
    end: ${endValue},
    image: '${banner.image}',
    description: \`${banner.description.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`,
    game: '${banner.game}',
    type: '${banner.type}',
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
      
      // Handle TBA dates - don't wrap in new Date()
      const startValue = banner.start === 'TBA' ? "'TBA'" : `new Date('${banner.start}')`;
      const endValue = banner.end === 'TBA' ? "'TBA'" : `new Date('${banner.end}')`;
      
      return `  {
    title: '${banner.title.replace(/'/g, "\\'")}',
    start: ${startValue},
    end: ${endValue},
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
