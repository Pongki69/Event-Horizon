import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsPath = path.join(__dirname, '..', 'src', 'data', 'scrapedGenshinHistoryEvents.js');
const jsonPath = path.join(__dirname, '..', 'src', 'data', 'scrapedGenshinHistoryEvents.json');

// Import the JS module
const { scrapedGenshinHistoryEvents } = await import(`file://${jsPath}`);

// Filter out events with T10:00:00.000Z timestamp pattern (current/upcoming events)
const historicalEvents = scrapedGenshinHistoryEvents.filter(event => {
  const startStr = event.start.toISOString();
  // Keep only events that DON'T have T10:00:00.000Z pattern
  return !startStr.includes('T10:00:00.000Z');
});

console.log(`Original events: ${scrapedGenshinHistoryEvents.length}`);
console.log(`After removing current/upcoming: ${historicalEvents.length}`);
console.log(`Removed: ${scrapedGenshinHistoryEvents.length - historicalEvents.length} events`);

// Convert to JS format
const eventsCode = historicalEvents.map(event => {
  const endNoteField = event.endNote ? `\n    endNote: '${event.endNote}',` : '';
  return `  {
    title: '${event.title.replace(/'/g, "\\'")}',
    start: new Date('${event.start.toISOString()}'),
    end: new Date('${event.end.toISOString()}'),${endNoteField}
    image: '${event.image}',
    description: \`${event.description.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`,
    game: '${event.game}',
    wikiUrl: '${event.wikiUrl}',
  }`;
}).join(',\n');

const jsCode = `// scrapedGenshinHistoryEvents.js
// Historical events only (current/upcoming removed)
// Last updated: ${new Date().toISOString()}

export const scrapedGenshinHistoryEvents = [
${eventsCode}
];
`;

// Write JS file
fs.writeFileSync(jsPath, jsCode);

// Convert to JSON format
const jsonData = historicalEvents.map(event => ({
  title: event.title,
  start: event.start.toISOString(),
  end: event.end.toISOString(),
  ...(event.endNote && { endNote: event.endNote }),
  image: event.image,
  description: event.description,
  game: event.game,
  wikiUrl: event.wikiUrl
}));

// Write JSON file
fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));

console.log(`✅ Removed current/upcoming events from both JS and JSON files`);
