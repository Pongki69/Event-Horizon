// archiveUtils.js
// Utility functions for managing compressed event/banner archives

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Block ad and analytics domains to speed up scraping and avoid anti-bot detection
 */
export async function setupRequestInterception(page) {
  const blockedDomains = [
    'adthrive.com',
    'ads.adthrive.com',
    'google-analytics.com',
    'googletagmanager.com',
    'doubleclick.net',
    'googlesyndication.com',
    'googleadservices.com',
    'facebook.com',
    'facebook.net',
    'quantserve.com',
    'scorecardresearch.com',
    'pubmatic.com',
    'ads.pubmatic.com',
    'advertising.com',
    'adnxs.com',
    'rubiconproject.com',
    'criteo.com',
    'outbrain.com',
    'taboola.com',
  ];

  await page.setRequestInterception(true);
  
  page.on('request', (request) => {
    const url = request.url();
    const resourceType = request.resourceType();
    
    // Block ads, analytics, and tracking scripts
    if (blockedDomains.some(domain => url.includes(domain))) {
      request.abort();
      return;
    }
    
    // Block unnecessary resource types to speed up loading
    if (['media', 'font'].includes(resourceType)) {
      request.abort();
      return;
    }
    
    request.continue();
  });
}

/**
 * Download and save an image locally
 */
export async function downloadImage(imageUrl, game, eventTitle, type = 'events', originalImageSrc = null) {
  if (!imageUrl || imageUrl === 'NO_IMAGE_FOUND' || imageUrl === '') {
    return null;
  }
  
  // If it's already a local path, return it as-is
  if (imageUrl.startsWith('/images/')) {
    return imageUrl;
  }
  
  try {
    // Create images directory with subfolder for type (events/banners)
    const gameFolder = game.toLowerCase().replace(/\s+/g, '-');
    const imagesDir = path.join(__dirname, '..', 'public', 'images', gameFolder, type);
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }
    
    // Generate filename from original low-res image src if provided, otherwise use high-res URL
    const sourceForFilename = originalImageSrc || imageUrl;
    const urlParts = sourceForFilename.split('/');
    const originalFilename = urlParts[urlParts.length - 2] || urlParts[urlParts.length - 1];
    const ext = path.extname(originalFilename) || '.png';
    const safeTitle = eventTitle.replace(/[^a-z0-9]/gi, '-').toLowerCase().substring(0, 50);
    const filename = `${safeTitle}${ext}`;
    const filepath = path.join(imagesDir, filename);

    // If a local image already exists and is not empty/corrupt, keep it.
    // This prevents a failed/missing scrape result from wiping a good high-res image.
    const MIN_VALID_SIZE = 10 * 1024; // 10 KB — anything smaller is likely a placeholder or error
    if (fs.existsSync(filepath)) {
      const existingStats = fs.statSync(filepath);
      if (existingStats.size >= MIN_VALID_SIZE) {
        console.log(`  ✓ Keeping existing image for ${eventTitle} (${(existingStats.size / 1024).toFixed(1)} KB)`);
        return `/images/${gameFolder}/${type}/${filename}`;
      }
      console.log(`  ⚠ Existing image for ${eventTitle} is too small (${existingStats.size} bytes), re-downloading...`);
    }

    console.log(`  Downloading image for ${eventTitle}...`);
    
    // Download the image
    return new Promise((resolve, reject) => {
      const protocol = imageUrl.startsWith('https') ? https : http;
      
      protocol.get(imageUrl, (response) => {
        if (response.statusCode !== 200) {
          console.log(`Failed to download image for ${eventTitle}: ${response.statusCode}`);
          resolve(imageUrl); // Return original URL as fallback
          return;
        }
        
        const fileStream = fs.createWriteStream(filepath);
        response.pipe(fileStream);
        
        let downloadedBytes = 0;
        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
        });
        
        fileStream.on('finish', () => {
          fileStream.close();
          
          // Get file stats to show size
          const stats = fs.statSync(filepath);
          const fileSizeKB = (stats.size / 1024).toFixed(2);
          const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
          
          // Log download success with size info
          if (stats.size > 1024 * 1024) {
            console.log(`  ✓ Downloaded HIGH-RES image: ${fileSizeMB} MB (${stats.size.toLocaleString()} bytes)`);
          } else {
            console.log(`  ✓ Downloaded image: ${fileSizeKB} KB (${stats.size.toLocaleString()} bytes)`);
          }
          
          resolve(`/images/${gameFolder}/${type}/${filename}`);
        });
        
        fileStream.on('error', (err) => {
          fs.unlink(filepath, () => {});
          console.log(`Error saving image for ${eventTitle}: ${err.message}`);
          resolve(imageUrl); // Return original URL as fallback
        });
      }).on('error', (err) => {
        console.log(`Error downloading image for ${eventTitle}: ${err.message}`);
        resolve(imageUrl); // Return original URL as fallback
      });
    });
  } catch (error) {
    console.error(`Error downloading image for ${eventTitle}: ${error.message}`);
    return imageUrl; // Return original URL as fallback
  }
}

/**
 * Load and decompress archive data
 */
export function loadArchive(archivePath) {
  if (!fs.existsSync(archivePath)) {
    return { events: [], banners: [] };
  }
  
  try {
    const compressed = fs.readFileSync(archivePath);
    const decompressed = zlib.gunzipSync(compressed);
    return JSON.parse(decompressed.toString());
  } catch (error) {
    console.error(`Error loading archive: ${error.message}`);
    return { events: [], banners: [] };
  }
}

/**
 * Compress and save archive data
 */
export function saveArchive(archivePath, data) {
  try {
    const json = JSON.stringify(data);
    const compressed = zlib.gzipSync(json);
    fs.writeFileSync(archivePath, compressed);
    
    // Log compression stats
    const originalSize = Buffer.byteLength(json);
    const compressedSize = compressed.length;
    const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(1);
    console.log(`Archive saved: ${(compressedSize / 1024).toFixed(1)}KB (${ratio}% compression)`);
  } catch (error) {
    console.error(`Error saving archive: ${error.message}`);
  }
}

/**
 * Merge new data with existing archive
 * Removes duplicates and keeps the most recent version of each event/banner
 */
export function mergeWithArchive(existingData, newEvents, newBanners) {
  const merged = {
    events: [...existingData.events],
    banners: [...existingData.banners],
    lastUpdated: new Date().toISOString()
  };
  
  // Merge events (use title + start date as unique key)
  for (const newEvent of newEvents) {
    const key = `${newEvent.title}_${newEvent.start}`;
    const existingIndex = merged.events.findIndex(e => 
      `${e.title}_${e.start}` === key
    );
    
    if (existingIndex >= 0) {
      // Update existing event
      merged.events[existingIndex] = newEvent;
    } else {
      // Add new event
      merged.events.push(newEvent);
    }
  }
  
  // Merge banners (use title + start date as unique key)
  for (const newBanner of newBanners) {
    const key = `${newBanner.title}_${newBanner.start}`;
    const existingIndex = merged.banners.findIndex(b => 
      `${b.title}_${b.start}` === key
    );
    
    if (existingIndex >= 0) {
      // Update existing banner
      merged.banners[existingIndex] = newBanner;
    } else {
      // Add new banner
      merged.banners.push(newBanner);
    }
  }
  
  // Sort by start date (newest first)
  merged.events.sort((a, b) => new Date(b.start) - new Date(a.start));
  merged.banners.sort((a, b) => new Date(b.start) - new Date(a.start));
  
  console.log(`Archive now contains ${merged.events.length} events and ${merged.banners.length} banners`);
  
  return merged;
}

/**
 * Get archive file path for a game
 */
export function getArchivePath(game) {
  return path.join(__dirname, `.archive-${game}.gz`);
}

/**
 * Load existing scraped events/banners from a JS data file.
 * Returns a Map keyed by event title (lowercased) -> existing image path.
 * Used to preserve existing images when a scrape run fails to find one.
 *
 * @param {string} filePath - Absolute path to the .js data file
 * @param {string} exportName - The named export to read (e.g. 'scrapedGenshinEvents')
 * @returns {Promise<Map<string, string>>} Map of title -> image path
 */
export async function loadExistingImages(filePath, exportName) {
  const imageMap = new Map();
  try {
    if (!fs.existsSync(filePath)) return imageMap;
    const mod = await import(`file://${filePath}?t=${Date.now()}`);
    const items = mod[exportName];
    if (!Array.isArray(items)) return imageMap;
    for (const item of items) {
      if (item.title && item.image) {
        imageMap.set(item.title.toLowerCase().trim(), item.image);
      }
    }
  } catch {
    // File may not exist yet or have a parse error — that's fine
  }
  return imageMap;
}

/**
 * Resolve the best image path for an event/banner.
 * - If newImage is a non-empty local path, use it.
 * - Otherwise fall back to whatever was already saved in the data file.
 * - Returns empty string if neither exists.
 *
 * @param {string|null} newImage - Newly scraped image path (may be null/empty)
 * @param {string} title - Event/banner title
 * @param {Map<string, string>} existingImageMap - Map from loadExistingImages()
 * @returns {string}
 */
export function resolveImage(newImage, title, existingImageMap) {
  if (newImage && newImage.startsWith('/images/')) {
    return newImage;
  }
  const fallback = existingImageMap.get(title.toLowerCase().trim()) || '';
  if (fallback) {
    // Verify the file actually exists on disk before using cached path
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const diskPath = path.join(__dirname, '..', 'public', fallback);
    if (!fs.existsSync(diskPath)) {
      return newImage || ''; // File deleted — don't reuse stale path
    }
    if (!newImage) {
      console.log(`  ↩ Keeping existing image for "${title}"`);
    }
    return fallback;
  }
  return newImage || '';
}
