// fixPermanentEventsJS.js
// Fix permanent events in the .js file to have end: 'Indefinite' and endNote: 'Permanent'

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// List of permanent event titles
const permanentEventTitles = [
  'Currency Wars: Zero-Sum Game',
  'Along With Heroic Spirits',
  'Divergent Universe: Protean Hero',
  'Simulated Universe: Unknowable Domain',
  'Nether Puppet',
  'When Charmony Rings Out...',
  'Camping in the Snow',
  'Simulated Universe: Gold and Gears',
  'Traveling Mimo',
  'Simulated Universe: Swarm Disaster',
  'Starlit Homecoming',
  'Joint Forces',
  'To Retire Upon the Perch',
  'Starkissed Synchrony',
  'Trailblazing Will',
  "Turquoise's Reverie",
  'Honkai: Star Rail Daily Check-in'
];

// Read the .js file
const jsFilePath = path.join(__dirname, '../src/data/scrapedStarRailHistoryEvents.js');
let jsContent = fs.readFileSync(jsFilePath, 'utf8');

console.log('Fixing permanent events in .js file...\n');

// For each permanent event, find and replace the end date and add endNote
for (const title of permanentEventTitles) {
  console.log(`Processing: ${title}`);
  
  // Escape special regex characters in title
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Pattern to match the event object
  // Matches from title through end date, then captures everything until game field
  const eventPattern = new RegExp(
    `(\\s*title:\\s*'${escapedTitle}',\\s*start:\\s*new Date\\([^)]+\\),\\s*)end:\\s*new Date\\([^)]+\\)(,\\s*)(image:)`,
    'g'
  );
  
  // Replace the end date with 'Indefinite' and add endNote
  jsContent = jsContent.replace(eventPattern, (match, before, comma, imageField) => {
    return `${before}end: 'Indefinite',\n    endNote: 'Permanent',${comma}${imageField}`;
  });
}

// Write the updated content back
fs.writeFileSync(jsFilePath, jsContent, 'utf8');

console.log('\n✅ Successfully updated .js file with Indefinite end dates and Permanent endNote!');
