// syncJSFromJSON.js
// Sync the .js file with the .json file for permanent events

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the JSON file to get the correct data
const jsonFilePath = path.join(__dirname, '../src/data/scrapedStarRailHistoryEvents.json');
const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));

// Find all permanent events
const permanentEvents = jsonData.filter(event => event.endNote === 'Permanent');

console.log(`Found ${permanentEvents.length} permanent events in JSON file\n`);

// Read the .js file
const jsFilePath = path.join(__dirname, '../src/data/scrapedStarRailHistoryEvents.js');
let jsContent = fs.readFileSync(jsFilePath, 'utf8');

// For each permanent event, update the .js file
for (const event of permanentEvents) {
  console.log(`Fixing: ${event.title}`);
  
  // Escape special regex characters in title
  const escapedTitle = event.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Find the event in the JS file and replace the end date line
  // Pattern: end: new Date('...'),
  // Need to handle multiline and various whitespace
  const endDatePattern = new RegExp(
    `(title: '${escapedTitle}',\\s+start: new Date\\([^)]+\\),\\s+)end: new Date\\([^)]+\\)(,)`,
    'g'
  );
  
  const beforeReplace = jsContent;
  jsContent = jsContent.replace(endDatePattern, `$1end: 'Indefinite',\n    endNote: 'Permanent'$2`);
  
  if (beforeReplace === jsContent) {
    console.log(`  ⚠️  No match found for: ${event.title}`);
  } else {
    console.log(`  ✓ Updated`);
  }
}

// Write the updated content back
fs.writeFileSync(jsFilePath, jsContent, 'utf8');

console.log('\n✅ Successfully synced .js file with .json file!');
