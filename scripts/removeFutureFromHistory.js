// Remove all future/active events from history
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scrapedStarRailHistoryEvents } from '../src/data/scrapedStarRailHistoryEvents.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const now = new Date();

console.log(`Total history events: ${scrapedStarRailHistoryEvents.length}`);

// Filter out events that haven't ended yet
const pastEvents = scrapedStarRailHistoryEvents.filter(event => {
  // Handle Indefinite dates - keep them in history
  if (event.end === 'Indefinite') {
    return true;
  }
  
  const endDate = new Date(event.end);
  
  // Check if date is valid
  if (isNaN(endDate.getTime())) {
    console.log(`  ⚠ Invalid date for: ${event.title}`);
    return true; // Keep events with invalid dates
  }
  
  const isPast = endDate <= now;
  
  if (!isPast) {
    console.log(`  Removing future event: ${event.title} (ends ${endDate.toISOString()})`);
  }
  
  return isPast;
});

console.log(`\nAfter filtering: ${pastEvents.length} events`);
console.log(`Removed: ${scrapedStarRailHistoryEvents.length - pastEvents.length}`);

// Sort by start date (newest first)
pastEvents.sort((a, b) => new Date(b.start) - new Date(a.start));

// Generate .js file
const historyPath = path.join(__dirname, '../src/data/scrapedStarRailHistoryEvents.js');
const jsContent = `// scrapedStarRailHistoryEvents.js
// Auto-generated - contains historical Star Rail events
// Last updated: ${new Date().toISOString()}

export const scrapedStarRailHistoryEvents = [
${pastEvents.map(event => {
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
const jsonContent = pastEvents.map(event => ({
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
