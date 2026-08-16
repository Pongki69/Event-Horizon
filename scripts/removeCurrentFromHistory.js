// removeCurrentFromHistory.js
// Removes current/upcoming events from history to avoid duplicates

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const currentPath = path.join(__dirname, '../src/data/scrapedStarRailEvents.js');
const historyPath = path.join(__dirname, '../src/data/scrapedStarRailHistoryEvents.js');

const currentUrl = new URL(`file:///${currentPath.replace(/\\/g, '/')}`);
const historyUrl = new URL(`file:///${historyPath.replace(/\\/g, '/')}`);

const { scrapedStarRailEvents } = await import(currentUrl);
const { scrapedStarRailHistoryEvents } = await import(historyUrl);

console.log(`Current events: ${scrapedStarRailEvents.length}`);
console.log(`History events: ${scrapedStarRailHistoryEvents.length}`);

// Remove events from history that exist in current
const filtered = scrapedStarRailHistoryEvents.filter(histEvent => {
  const inCurrent = scrapedStarRailEvents.find(curr => 
    curr.title === histEvent.title && 
    new Date(curr.start).getTime() === new Date(histEvent.start).getTime()
  );
  if (inCurrent) {
    console.log(`  Removing from history: ${histEvent.title}`);
    return false;
  }
  return true;
});

console.log(`\nAfter filtering: ${filtered.length} events`);
console.log(`Removed: ${scrapedStarRailHistoryEvents.length - filtered.length}`);

// Sort by start date (newest first)
filtered.sort((a, b) => new Date(b.start) - new Date(a.start));

// Generate .js file
const jsContent = `// scrapedStarRailHistoryEvents.js
// Auto-generated - contains historical Star Rail events
// Last updated: ${new Date().toISOString()}

export const scrapedStarRailHistoryEvents = [
${filtered.map(event => {
  const startDate = event.start === 'Indefinite' ? 'Indefinite' : new Date(event.start).toISOString();
  const endDate = event.end === 'Indefinite' ? 'Indefinite' : new Date(event.end).toISOString();
  
  return `  {
    title: '${event.title.replace(/'/g, "\\'")}',
    start: ${event.start === 'Indefinite' ? "'Indefinite'" : `new Date('${startDate}')`},
    end: ${event.end === 'Indefinite' ? "'Indefinite'" : `new Date('${endDate}')`},
    image: '${event.image}',
    description: \`${event.description.replace(/`/g, '\\`')}\`,
    game: '${event.game}',${event.isPermanent ? `
    isPermanent: true,` : ''}${event.endNote ? `
    endNote: '${event.endNote}',` : ''}
  }`;
}).join(',\n')}
];
`;

fs.writeFileSync(historyPath, jsContent, 'utf-8');
console.log(`\n✅ Updated: ${historyPath}`);

// Generate JSON
const jsonPath = path.join(__dirname, '../src/data/scrapedStarRailHistoryEvents.json');
const jsonContent = filtered.map(event => ({
  title: event.title,
  start: event.start === 'Indefinite' ? 'Indefinite' : new Date(event.start).toISOString(),
  end: event.end === 'Indefinite' ? 'Indefinite' : new Date(event.end).toISOString(),
  image: event.image,
  description: event.description,
  game: event.game,
  ...(event.isPermanent && { isPermanent: true }),
  ...(event.endNote && { endNote: event.endNote })
}));

fs.writeFileSync(jsonPath, JSON.stringify(jsonContent, null, 2), 'utf-8');
console.log(`✅ Updated: ${jsonPath}`);
