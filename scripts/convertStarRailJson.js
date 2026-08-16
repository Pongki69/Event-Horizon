import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonPath = path.join(__dirname, '..', 'src', 'data', 'scrapedStarRailHistoryEvents.json');
const jsPath = path.join(__dirname, '..', 'src', 'data', 'scrapedStarRailHistoryEvents.js');

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const eventsCode = data.map(event => {
  return `  {
    title: '${event.title.replace(/'/g, "\\'")}',
    start: '${event.start}',
    end: '${event.end}',
    image: '${event.image}',
    description: \`${event.description.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`,
    game: '${event.game}',
    wikiUrl: '${event.wikiUrl}',
  }`;
}).join(',\n');

const jsCode = `// scrapedStarRailHistoryEvents.js
// Auto-generated from JSON
// Last updated: ${new Date().toISOString()}
// NOTE: Dates are strings and need to be parsed by the app

export const scrapedStarRailHistoryEvents = [
${eventsCode}
];
`;

fs.writeFileSync(jsPath, jsCode);
console.log(`✅ Converted ${data.length} events from JSON to JS`);
