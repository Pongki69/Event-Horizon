import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonPath = path.join(__dirname, '..', 'src', 'data', 'scrapedGenshinHistoryEvents.json');
const jsPath = path.join(__dirname, '..', 'src', 'data', 'scrapedGenshinHistoryEvents.js');

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const eventsCode = data.map(event => {
  const endNoteField = event.endNote ? `\n    endNote: '${event.endNote}',` : '';
  return `  {
    title: '${event.title.replace(/'/g, "\\'")}',
    start: new Date('${event.start}'),
    end: new Date('${event.end}'),${endNoteField}
    image: '${event.image}',
    description: \`${event.description.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`,
    game: '${event.game}',
    wikiUrl: '${event.wikiUrl}',
  }`;
}).join(',\n');

const jsCode = `// scrapedGenshinHistoryEvents.js
// Auto-generated from JSON
// Last updated: ${new Date().toISOString()}

export const scrapedGenshinHistoryEvents = [
${eventsCode}
];
`;

fs.writeFileSync(jsPath, jsCode);
console.log(`✅ Converted ${data.length} events from JSON to JS`);
