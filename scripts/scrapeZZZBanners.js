// scrapeZZZBanners.js
// Script to scrape Zenless Zone Zero banners from Game8
// Run with: node scripts/scrapeZZZBanners.js

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { downloadImage, loadExistingImages, resolveImage } from './archiveUtils.js';

puppeteer.use(StealthPlugin());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Starting Zenless Zone Zero banner scraper...');

/**
 * Resolve canonical agent name by visiting the ZZZ wiki page and reading the h1 title.
 * e.g. if wiki redirects "Starlight Billy" -> "Starlight - Billy"
 */
async function resolveAgentName(agentName) {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage'
      ]
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    const url = `https://zenless-zone-zero.fandom.com/wiki/${encodeURIComponent(agentName)}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

    const pageTitle = await page.evaluate(() => {
      const h1 = document.querySelector('h1.page-header__title, h1#firstHeading, h1.firstHeading');
      return h1 ? h1.textContent.trim() : '';
    });

    await browser.close();

    if (pageTitle && pageTitle !== agentName) {
      return pageTitle;
    }
    return null;
  } catch {
    return null;
  }
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
  return months[monthName.toLowerCase().replace('.', '')];
}

/**
 * Parse Game8 date format and convert to UTC timestamp
 * ZZZ banners typically end at 03:59 Asia time (UTC+8) = 19:59 UTC previous day
 */
function parseBannerDate(dateText, isEndDate = false) {
  // Match format: "Month Day, Year" or "Mon. Day, Year"
  const dateMatch = dateText.match(/([A-Za-z]+)\.?\s+(\d{1,2}),\s+(\d{4})/);
  
  if (dateMatch) {
    const [, monthName, day, year] = dateMatch;
    const month = monthToIndex(monthName);
    
    if (isEndDate) {
      // Banner ends at 03:59 Asia time (UTC+8) = 19:59 UTC previous day
      console.log(`Parsed banner end date: ${monthName} ${day}, ${year} 03:59 UTC+8`);
      return Date.UTC(parseInt(year), month, parseInt(day) - 1, 19, 59, 0);
    } else {
      // Banner starts at 12:00 noon Asia time (UTC+8) = 04:00 UTC
      console.log(`Parsed banner start date: ${monthName} ${day}, ${year} 12:00 UTC+8`);
      return Date.UTC(parseInt(year), month, parseInt(day), 4, 0, 0);
    }
  }
  
  console.log(`Could not parse banner date from: ${dateText}`);
  return null;
}

async function scrapeZZZBanners() {
  console.log('Fetching banners from Game8...');

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Enable console logging from page
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    // Navigate to Game8 banner schedule page
    await page.goto('https://game8.co/games/Zenless-Zone-Zero/archives/435687', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    console.log('Page loaded, extracting banner data...');
    
    // Wait for content to load
    await page.waitForSelector('body', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Extract banner data from the page
    const banners = await page.evaluate(() => {
      const results = [];

      // Process both "Current Banners" and "Upcoming Banners" h2 sections
      const h2s = Array.from(document.querySelectorAll('h2'));
      const targetH2s = h2s.filter(h => {
        const t = h.textContent.trim().toLowerCase();
        return (t.includes('current') && t.includes('banner')) ||
               (t.includes('upcoming') && t.includes('banner'));
      });

      console.log('Target h2s found: ' + targetH2s.map(h => h.textContent.trim()).join(' | '));

      for (const h2 of targetH2s) {
        const isUpcoming = h2.textContent.trim().toLowerCase().includes('upcoming');
        let el = h2.nextElementSibling;

        while (el) {
          if (el.tagName === 'H2') break;

          if (el.tagName === 'TABLE') {
            const text = el.textContent;
            if (!text.includes('Duration') || !text.includes('Rate-Up Agents')) {
              el = el.nextElementSibling;
              continue;
            }

            // Extract dates
            const dateMatch = text.match(/Duration\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})\s*[-–]\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/);
            if (!dateMatch) { el = el.nextElementSibling; continue; }
            const [, startDate, endDate] = dateMatch;

            // Extract agent names from "Rate-Up Agents" row
            // text is collapsed whitespace so use split approach
            const rateUpIdx = text.indexOf('Rate-Up Agents');
            let agentNames = [];
            if (rateUpIdx !== -1) {
              // Take the chunk after "Rate-Up Agents" up to the next known field
              const afterRateUp = text.substring(rateUpIdx + 'Rate-Up Agents'.length, rateUpIdx + 200);
              // Extract names before " (S-Rank)" or " (A-Rank)"
              const rankPattern = /([A-Za-z][A-Za-z\s\-'.]+?)\s*\([SA]-Rank\)/g;
              let m;
              while ((m = rankPattern.exec(afterRateUp)) !== null) {
                const name = m[1].trim();
                if (name.length > 1) agentNames.push(name);
              }
            }

            console.log('Agent names found: ' + JSON.stringify(agentNames));

            if (agentNames.length === 0) { el = el.nextElementSibling; continue; }

            // Primary agent is the first S-Rank
            const primaryAgent = agentNames[0];
            // Title: primary agent name (others listed if multi-agent)
            const displayTitle = agentNames.length > 1
              ? `${primaryAgent} & ${agentNames.slice(1).join(' & ')}`
              : primaryAgent;

            results.push({
              name: primaryAgent,
              allAgents: agentNames,
              displayTitle,
              startDate,
              endDate,
              isUpcoming
            });
          }

          el = el.nextElementSibling;
        }
      }

      return results;
    });

    console.log(`Found ${banners.length} banners`);

    // ── Wiki API helpers (no Puppeteer needed) ──────────────────────────────

    /**
     * Resolve the full wiki title for a ZZZ agent using the search API.
     * e.g. "Yuzuha" → "Ukinami Yuzuha", "Remielle" → "Remielle Dan"
     */
    async function resolveZZZWikiTitle(name) {
      try {
        const url = `https://zenless-zone-zero.fandom.com/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&srlimit=5&format=json&origin=*`;
        const res = await fetch(url);
        const json = await res.json();
        const results = (json?.query?.search || []).filter(r => !r.title.includes('/') && !r.title.includes('('));
        // Score: exact name inclusion > starts with name
        const nameLower = name.toLowerCase();
        const scored = results.map(r => {
          const t = r.title.toLowerCase();
          const score = t === nameLower ? 3 : t.includes(nameLower) ? 2 : t.startsWith(nameLower.split(' ')[0]) ? 1 : 0;
          return { title: r.title, score };
        }).filter(r => r.score > 0).sort((a, b) => b.score - a.score);
        return scored[0]?.title || name;
      } catch { return name; }
    }

    /**
     * Get agent portrait URL via pageimages API.
     * Returns full-res URL (revision stripped), or null.
     */
    async function resolveZZZAgentImage(name) {
      try {
        const wikiTitle = await resolveZZZWikiTitle(name);
        const url = `https://zenless-zone-zero.fandom.com/api.php?action=query&titles=${encodeURIComponent(wikiTitle)}&prop=pageimages&pithumbsize=600&format=json&origin=*`;
        const res = await fetch(url);
        const json = await res.json();
        const p = Object.values(json?.query?.pages || {})[0];
        const thumbUrl = p?.thumbnail?.source;
        if (thumbUrl) {
          // Strip thumbnail scaling params to get full res
          return thumbUrl.split('/revision/')[0];
        }
        return null;
      } catch { return null; }
    }

    /**
     * Get agent description via wiki API — no Puppeteer needed.
     * Parses the {{Description|...}} template from the Lore page wikitext.
     */
    async function resolveZZZDescription(name) {
      try {
        const wikiTitle = await resolveZZZWikiTitle(name);
        const url = `https://zenless-zone-zero.fandom.com/api.php?action=query&titles=${encodeURIComponent(wikiTitle)}/Lore&prop=revisions&rvprop=content&rvslots=main&rvsection=0&format=json&origin=*`;
        const res = await fetch(url);
        const json = await res.json();
        const p = Object.values(json?.query?.pages || {})[0];
        const content = p?.revisions?.[0]?.slots?.main?.['*'] || '';
        if (!content) return '';
        // Extract text from {{Description|...}} template
        const match = content.match(/\{\{Description\|(.+?)(?:\}\}|$)/s);
        if (!match) return '';
        // Strip wiki markup: bold/italic markers, links [[X|Y]]->Y or [[X]]->X, <tags>, center/big
        let desc = match[1]
          .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
          .replace(/\[\[([^\]]+)\]\]/g, '$1')
          .replace(/'{2,}/g, '')
          .replace(/<[^>]+>/g, '')
          .replace(/\{\{[^}]+\}\}/g, '')
          .replace(/\n+/g, ' ')
          .trim();
        return desc;
      } catch { return ''; }
    }

    // ── Process all banners ────────────────────────────────────────────────
    const processedBanners = [];

    for (const banner of banners) {
      console.log(`\nProcessing banner: ${banner.displayTitle} (${banner.isUpcoming ? 'upcoming' : 'current'})`);

      // Parse dates
      const startDate = parseBannerDate(banner.startDate, false);
      const endDate = parseBannerDate(banner.endDate, true);

      if (!startDate || !endDate) {
        console.log(`  ✗ Skipping: invalid dates`);
        continue;
      }

      const type = banner.isUpcoming ? 'upcoming' : 'current';

      // Create one entry per agent in allAgents
      for (const agentName of banner.allAgents) {
        console.log(`  Processing agent: ${agentName}`);

        // Get image via wiki API
        let localImage = '';
        const imageUrl = await resolveZZZAgentImage(agentName);
        if (imageUrl) {
          console.log(`  ✓ Found wiki image`);
          localImage = await downloadImage(imageUrl, 'zenless-zone-zero', agentName, 'banners');
          if (localImage) console.log(`  ✓ Image saved: ${localImage}`);
        } else {
          console.log(`  ✗ No image found on wiki`);
        }

        // Get description
        let description = await resolveZZZDescription(agentName);
        if (description) {
          console.log(`  ✓ Description found (${description.length} chars)`);
        } else {
          description = `${agentName} banner in Zenless Zone Zero.`;
          console.log(`  ⚠ No description, using fallback`);
        }

        processedBanners.push({
          title: agentName,
          start: new Date(startDate).toISOString(),
          end: new Date(endDate).toISOString(),
          image: localImage || '',
          type,
          game: 'Zenless Zone Zero',
          description,
        });
      }
    }
    console.log(`\nProcessed ${processedBanners.length} banners`);

    // Generate JavaScript code
    const bannersCode = processedBanners.map(banner => {
      return `  {
    title: '${banner.title.replace(/'/g, "\\'")}',
    start: new Date('${banner.start}'),
    end: new Date('${banner.end}'),
    image: '${banner.image}',
    type: '${banner.type || ''}',${banner.isTBA ? `\n    isTBA: true,` : ''}
    game: '${banner.game}',
    description: '${banner.description.replace(/'/g, "\\'")}',
  }`;
    }).join(',\n');

    const jsCode = `// scrapedZZZBanners.js
// Auto-generated by scrapeZZZBanners.js
// Last updated: ${new Date().toISOString()}

export const scrapedZZZBanners = [
${bannersCode}
];
`;

    // Write to file
    const outputPath = path.join(__dirname, '..', 'src', 'data', 'scrapedZZZBanners.js');
    const existingImageMap = await loadExistingImages(outputPath, 'scrapedZZZBanners');

    const bannersCodeFinal = processedBanners.map(banner => {
      const img = resolveImage(banner.image, banner.title, existingImageMap);
      return `  {
    title: '${banner.title.replace(/'/g, "\\'")}',
    start: new Date('${banner.start}'),
    end: new Date('${banner.end}'),
    image: '${img.replace(/'/g, "\\'")}',
    type: '${banner.type || ''}',${banner.isTBA ? `\n    isTBA: true,` : ''}
    game: '${banner.game}',
    description: '${banner.description.replace(/'/g, "\\'")}',
  }`;
    }).join(',\n');

    const jsCodeFinal = `// scrapedZZZBanners.js
// Auto-generated by scrapeZZZBanners.js
// Last updated: ${new Date().toISOString()}

export const scrapedZZZBanners = [
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

scrapeZZZBanners();
