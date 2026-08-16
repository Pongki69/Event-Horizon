// deduplicateStarRailHistory.js
// Removes duplicate events from Star Rail history, keeping the one with better description

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the history events
const historyPath = path.join(__dirname, '../src/data/scrapedStarRailHistoryEvents.js');
const historyUrl = new URL(`file:///${historyPath.replace(/\\/g, '/')}`);
const { scrapedStarRailHistoryEvents } = await import(historyUrl);

console.log(`Original events: ${scrapedStarRailHistoryEvents.length}`);

// Group by title
const grouped = {};
scrapedStarRailHistoryEvents.forEach(event => {
  if (!grouped[event.title]) {
    grouped[event.title] = [];
  }
  grouped[event.title].push(event);
});

// Find duplicates
const duplicateTitles = Object.entries(grouped).filter(([_, arr]) => arr.length > 1);
console.log(`\nFound ${duplicateTitles.length} duplicate titles:`);
duplicateTitles.forEach(([title, instances]) => {
  console.log(`  - ${title} (${instances.length} times)`);
});

// Deduplicate: keep the one with better description
const deduped = [];
Object.values(grouped).forEach(group => {
  if (group.length === 1) {
    deduped.push(group[0]);
  } else {
    // Keep the one with description that's NOT 'Historical event.'
    const withDesc = group.find(e => e.description !== 'Historical event.');
    if (withDesc) {
      deduped.push(withDesc);
      console.log(`  ✓ Kept version with description for: ${withDesc.title}`);
    } else {
      // If all are 'Historical event.', keep the first one
      deduped.push(group[0]);
      console.log(`  ⚠ All versions have generic description for: ${group[0].title}`);
    }
  }
});

console.log(`\nAfter deduplication: ${deduped.length}`);
console.log(`Removed: ${scrapedStarRailHistoryEvents.length - deduped.length}`);

// Sort by start date (newest first)
deduped.sort((a, b) => b.start - a.start);

// Generate .js file
const jsContent = `// scrapedStarRailHistoryEvents.js
// Auto-generated - contains historical Star Rail events
// Last updated: ${new Date().toISOString()}

export const scrapedStarRailHistoryEvents = [
${deduped.map(event => `  {
    title: '${event.title.replace(/'/g, "\\'")}',
    start: new Date('${event.start.toISOString()}'),
    end: new Date('${event.end.toISOString()}'),
    image: '${event.image}',
    description: \`${event.description.replace(/`/g, '\\`')}\`,
    game: '${event.game}',${event.isPermanent ? `
    isPermanent: true,` : ''}${event.endNote ? `
    endNote: '${event.endNote}',` : ''}
  }`).join(',\n')}
];
`;

fs.writeFileSync(historyPath, jsContent, 'utf-8');
console.log(`\n✅ Updated: ${historyPath}`);

// Generate JSON backup
const jsonPath = path.join(__dirname, '../src/data/scrapedStarRailHistoryEvents.json');
const jsonContent = deduped.map(event => ({
  title: event.title,
  start: event.start.toISOString(),
  end: event.end.toISOString(),
  image: event.image,
  description: event.description,
  game: event.game,
  ...(event.isPermanent && { isPermanent: true }),
  ...(event.endNote && { endNote: event.endNote })
}));

fs.writeFileSync(jsonPath, JSON.stringify(jsonContent, null, 2), 'utf-8');
console.log(`✅ Updated: ${jsonPath}`);
