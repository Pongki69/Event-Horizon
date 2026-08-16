// fixAllPermanentEvents.js
// Fix all permanent events in the .js file to have end: 'Indefinite' and endNote: 'Permanent'

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// List of permanent event titles (excluding Currency Wars and Divergent Universe which are endgame)
const permanentEventTitles = [
  'Starkissed Synchrony',
  'Trailblazing Will',
  "Turquoise's Reverie",
  'Starlit Homecoming',
  'Joint Forces',
  'To Retire Upon the Perch',
  'Simulated Universe: Swarm Disaster',
  'Simulated Universe: Gold and Gears',
  'Camping in the Snow',
  'When Charmony Rings Out...',
  'Nether Puppet',
  'Simulated Universe: Unknowable Domain',
  'Along With Heroic Spirits',
  'Honkai: Star Rail Daily Check-in',
  'Traveling Mimo'
];

// Read the .js file
const jsFilePath = path.join(__dirname, '../src/data/scrapedStarRailHistoryEvents.js');
let jsContent = fs.readFileSync(jsFilePath, 'utf8');

console.log('Fixing permanent events in .js file...\n');

let fixedCount = 0;

// For each permanent event, find and replace
for (const title of permanentEventTitles) {
  // Escape special regex characters in title
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Pattern to match: title, start, end (with Date), then capture rest
  const pattern = new RegExp(
    `(\\s*title: '${escapedTitle}',\\s+start: new Date\\([^)]+\\),\\s+)end: new Date\\([^)]+\\)(,\\s+)`,
    'g'
  );
  
  const before = jsContent;
  jsContent = jsContent.replace(pattern, `$1end: 'Indefinite',\n    endNote: 'Permanent'$2`);
  
  if (before !== jsContent) {
    console.log(`✓ Fixed: ${title}`);
    fixedCount++;
  } else {
    console.log(`⚠ Not found or already fixed: ${title}`);
  }
}

// Write the updated content back
fs.writeFileSync(jsFilePath, jsContent, 'utf8');

console.log(`\n✅ Successfully fixed ${fixedCount} permanent events!`);
