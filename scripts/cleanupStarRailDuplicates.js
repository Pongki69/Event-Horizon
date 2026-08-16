// cleanupStarRailDuplicates.js
// Removes duplicate events from Star Rail history that match current events
// Handles cases where titles have date suffixes or slight time differences

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const historyPath = path.join(__dirname, '../src/data/scrapedStarRailHistoryEvents.js');
const currentPath = path.join(__dirname, '../src/data/scrapedStarRailEvents.js');
const historyUrl = new URL(`file:///${historyPath.replace(/\\/g, '/')}`);
const currentUrl = new URL(`file:///${currentPath.replace(/\\/g, '/')}`);

const { scrapedStarRailHistoryEvents } = await import(historyUrl);
const { scrapedStarRailEvents } = await import(currentUrl);

console.log(`History events: ${scrapedStarRailHistoryEvents.length}`);
console.log(`Current events: ${scrapedStarRailEvents.length}\n`);

// Function to normalize title (remove date suffixes)
function normalizeTitle(title) {
  // Remove date patterns like "2026-02-23" or "2025-11-05"
  return title.replace(/\s+\d{4}-\d{2}-\d{2}$/, '').trim();
}

// Function to check if two dates are within 24 hours of each other
function datesMatch(date1, date2) {
  const diff = Math.abs(new Date(date1) - new Date(date2));
  const hoursDiff = diff / (1000 * 60 * 60);
  return hoursDiff < 24; // Within 24 hours
}

// Find duplicates
const toRemove = [];
for (const histEvent of scrapedStarRailHistoryEvents) {
  const histNormTitle = normalizeTitle(histEvent.title);
  
  for (const currEvent of scrapedStarRailEvents) {
    const currNormTitle = normalizeTitle(currEvent.title);
    
    // Check if titles match (normalized) and dates are close
    if (histNormTitle === currNormTitle && 
        datesMatch(histEvent.start, currEvent.start) &&
        datesMatch(histEvent.end, currEvent.end)) {
      
      console.log(`Found duplicate:`);
      console.log(`  History: "${histEvent.title}" (${new Date(histEvent.start).toISOString()})`);
      console.log(`  Current: "${currEvent.title}" (${new Date(currEvent.start).toISOString()})`);
      console.log(`  → Removing history version\n`);
      
      toRemove.push(histEvent);
      break;
    }
  }
}

console.log(`\nRemoving ${toRemove.length} duplicate events from history`);

// Filter out duplicates
const cleaned = scrapedStarRailHistoryEvents.filter(e => !toRemove.includes(e));

console.log(`After cleanup: ${cleaned.length} events\n`);

// Sort by start date (newest first)
cleaned.sort((a, b) => new Date(b.start) - new Date(a.start));

// Generate .js file
const jsContent = `// scrapedStarRailHistoryEvents.js
// Auto-generated - contains historical Star Rail events
// Last updated: ${new Date().toISOString()}

export const scrapedStarRailHistoryEvents = [
${cleaned.map(event => `  {
    title: '${event.title.replace(/'/g, "\\'")}',
    start: new Date('${new Date(event.start).toISOString()}'),
    end: new Date('${new Date(event.end).toISOString()}'),
    image: '${event.image}',
    description: \`${event.description.replace(/`/g, '\\`')}\`,
    game: '${event.game}',${event.isPermanent ? `
    isPermanent: true,` : ''}${event.endNote ? `
    endNote: '${event.endNote}',` : ''}
  }`).join(',\n')}
];
`;

fs.writeFileSync(historyPath, jsContent, 'utf-8');
console.log(`✅ Updated: ${historyPath}`);

// Generate JSON backup
const jsonPath = path.join(__dirname, '../src/data/scrapedStarRailHistoryEvents.json');
const jsonContent = cleaned.map(event => ({
  title: event.title,
  start: new Date(event.start).toISOString(),
  end: new Date(event.end).toISOString(),
  image: event.image,
  description: event.description,
  game: event.game,
  ...(event.isPermanent && { isPermanent: true }),
  ...(event.endNote && { endNote: event.endNote })
}));

fs.writeFileSync(jsonPath, JSON.stringify(jsonContent, null, 2), 'utf-8');
console.log(`✅ Updated: ${jsonPath}`);
