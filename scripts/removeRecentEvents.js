// Remove recently scraped events (the current/upcoming events)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsPath = path.join(__dirname, '..', 'src', 'data', 'scrapedGenshinHistoryEvents.js');
const jsonPath = path.join(__dirname, '..', 'src', 'data', 'scrapedGenshinHistoryEvents.json');

// Import the current events
const { scrapedGenshinHistoryEvents } = await import(`file://${jsPath}?t=${Date.now()}`);

console.log(`Total events before removal: ${scrapedGenshinHistoryEvents.length}`);

// Remove events that start after a certain date (current/upcoming events)
// Let's remove events starting from December 1, 2025 onwards
const cutoffDate = new Date('2025-12-01T00:00:00.000Z');

const filteredEvents = scrapedGenshinHistoryEvents.filter(event => {
  const startDate = new Date(event.start);
  
  // Keep events that started before the cutoff date
  const shouldKeep = startDate < cutoffDate;
  
  if (!shouldKeep) {
    console.log(`Removing: ${event.title} (starts ${startDate.toISOString()})`);
  }
  
  return shouldKeep;
});

console.log(`Total events after removal: ${filteredEvents.length}`);
console.log(`Removed ${scrapedGenshinHistoryEvents.length - filteredEvents.length} events`);

// Write JS file
const jsCode = `// scrapedGenshinHistoryEvents.js
// Auto-generated from JSON
// Last updated: ${new Date().toISOString()}

export const scrapedGenshinHistoryEvents = [
${filteredEvents.map(event => `  {
    title: '${event.title.replace(/'/g, "\\'")}',
    start: new Date('${new Date(event.start).toISOString()}'),
    end: new Date('${new Date(event.end).toISOString()}'),${event.endNote ? `\n    endNote: '${event.endNote}',` : ''}
    image: '${(event.image || '').replace(/'/g, "\\'")}',
    description: \`${(event.description || '').replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`,
    game: 'Genshin Impact',
    wikiUrl: '${(event.wikiUrl || '').replace(/'/g, "\\'")}',
  }`).join(',\n')}
];
`;

fs.writeFileSync(jsPath, jsCode);
console.log(`✅ Updated: ${jsPath}`);

// Write JSON file
const jsonData = filteredEvents.map(event => ({
  title: event.title,
  start: new Date(event.start).toISOString(),
  end: new Date(event.end).toISOString(),
  endNote: event.endNote,
  image: event.image || '',
  description: event.description || '',
  game: 'Genshin Impact',
  wikiUrl: event.wikiUrl || ''
}));

fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));
console.log(`✅ Updated: ${jsonPath}`);
