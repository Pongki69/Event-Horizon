import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonPath = path.join(__dirname, '..', 'src', 'data', 'scrapedStarRailHistoryEvents.json');
const jsPath = path.join(__dirname, '..', 'src', 'data', 'scrapedStarRailHistoryEvents.js');

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

// Parse date string to Date object
function parseStarRailDate(dateStr) {
  if (!dateStr || dateStr === 'Indefinite') {
    return null;
  }
  
  // Remove timezone info and clean up
  dateStr = dateStr.replace(/UTC[+-]\d+/gi, '').replace(/GMT[+-]\d+/gi, '').trim();
  
  // Try to parse the date
  const date = new Date(dateStr);
  
  if (isNaN(date.getTime())) {
    console.log(`⚠ Could not parse date: "${dateStr}"`);
    return null;
  }
  
  return date;
}

const eventsWithDates = data.map(event => {
  const startDate = parseStarRailDate(event.start);
  const endDate = parseStarRailDate(event.end);
  
  // Skip events with invalid dates
  if (!startDate || !endDate) {
    console.log(`Skipping event: ${event.title} (invalid dates)`);
    return null;
  }
  
  return {
    ...event,
    start: startDate.toISOString(),
    end: endDate.toISOString()
  };
}).filter(e => e !== null);

console.log(`\nProcessed ${eventsWithDates.length} events out of ${data.length}`);

const eventsCode = eventsWithDates.map(event => {
  return `  {
    title: '${event.title.replace(/'/g, "\\'")}',
    start: new Date('${event.start}'),
    end: new Date('${event.end}'),
    image: '${event.image}',
    description: \`${event.description.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`,
    game: '${event.game}',
    wikiUrl: '${event.wikiUrl}',
  }`;
}).join(',\n');

const jsCode = `// scrapedStarRailHistoryEvents.js
// Auto-generated from JSON with parsed dates
// Last updated: ${new Date().toISOString()}

export const scrapedStarRailHistoryEvents = [
${eventsCode}
];
`;

fs.writeFileSync(jsPath, jsCode);
console.log(`✅ Converted ${eventsWithDates.length} events with Date objects`);
