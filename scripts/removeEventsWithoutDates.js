// removeEventsWithoutDates.js
// Removes events from history that don't have date suffixes

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const historyPath = path.join(__dirname, '../src/data/scrapedStarRailHistoryEvents.js');
const historyUrl = new URL(`file:///${historyPath.replace(/\\/g, '/')}`);
const { scrapedStarRailHistoryEvents } = await import(historyUrl);

console.log('Original history events:', scrapedStarRailHistoryEvents.length);

// Keep only events WITH date suffixes (format: YYYY-MM-DD)
const withDateSuffix = scrapedStarRailHistoryEvents.filter(e => /\d{4}-\d{2}-\d{2}/.test(e.title));

console.log('Events with date suffix:', withDateSuffix.length);
console.log('Removed:', scrapedStarRailHistoryEvents.length - withDateSuffix.length);

// Sort by start date (newest first)
withDateSuffix.sort((a, b) => new Date(b.start) - new Date(a.start));

// Generate .js file
const jsContent = `// scrapedStarRailHistoryEvents.js
// Auto-generated - contains historical Star Rail events
// Last updated: ${new Date().toISOString()}

export const scrapedStarRailHistoryEvents = [
${withDateSuffix.map(event => `  {
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
console.log('✅ Updated .js file');

// Generate JSON
const jsonPath = path.join(__dirname, '../src/data/scrapedStarRailHistoryEvents.json');
const jsonContent = withDateSuffix.map(event => ({
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
console.log('✅ Updated .json file');
