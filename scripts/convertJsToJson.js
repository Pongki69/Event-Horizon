import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsPath = path.join(__dirname, '..', 'src', 'data', 'scrapedGenshinHistoryEvents.js');
const jsonPath = path.join(__dirname, '..', 'src', 'data', 'scrapedGenshinHistoryEvents.json');

// Import the JS module
const { scrapedGenshinHistoryEvents } = await import(`file://${jsPath}`);

// Convert to JSON format
const jsonData = scrapedGenshinHistoryEvents.map(event => ({
  title: event.title,
  start: event.start.toISOString(),
  end: event.end.toISOString(),
  ...(event.endNote && { endNote: event.endNote }),
  image: event.image,
  description: event.description,
  game: event.game,
  wikiUrl: event.wikiUrl
}));

// Write to JSON file
fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));
console.log(`✅ Converted ${jsonData.length} events from JS to JSON`);
