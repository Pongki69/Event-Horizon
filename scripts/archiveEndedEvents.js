// archiveEndedEvents.js
// Move ended events from current event files to history files
// Run with: node scripts/archiveEndedEvents.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const now = new Date();

console.log('='.repeat(80));
console.log('ARCHIVING ENDED EVENTS');
console.log('='.repeat(80));
console.log(`Current time: ${now.toISOString()}\n`);

/**
 * Archive ended events for a specific game
 */
async function archiveGame(gameName, currentFile, historyFile) {
  console.log(`\n${'─'.repeat(80)}`);
  console.log(`Processing: ${gameName}`);
  console.log('─'.repeat(80));
  
  const currentPath = path.join(__dirname, '..', 'src', 'data', currentFile);
  const historyPath = path.join(__dirname, '..', 'src', 'data', historyFile);
  
  // Check if files exist
  if (!fs.existsSync(currentPath)) {
    console.log(`⚠ ${currentFile} not found, skipping...`);
    return { archived: 0, removed: 0 };
  }
  
  if (!fs.existsSync(historyPath)) {
    console.log(`⚠ ${historyFile} not found, skipping...`);
    return { archived: 0, removed: 0 };
  }
  
  // Import the events
  const currentModule = await import(`../src/data/${currentFile}`);
  const historyModule = await import(`../src/data/${historyFile}`);
  
  const currentEvents = Object.values(currentModule)[0]; // Get first export
  const historyEvents = Object.values(historyModule)[0];
  
  // Find ended events
  const endedEvents = currentEvents.filter(e => new Date(e.end) <= now);
  const activeEvents = currentEvents.filter(e => new Date(e.end) > now);
  
  console.log(`  Current events: ${currentEvents.length}`);
  console.log(`  Ended events: ${endedEvents.length}`);
  console.log(`  Active events: ${activeEvents.length}`);
  
  if (endedEvents.length === 0) {
    console.log(`  ✓ No events to archive`);
    return { archived: 0, removed: 0 };
  }
  
  // Check which events are already in history
  const eventsToArchive = [];
  for (const event of endedEvents) {
    const alreadyInHistory = historyEvents.some(h => 
      h.title === event.title && 
      new Date(h.start).getTime() === new Date(event.start).getTime()
    );
    
    if (!alreadyInHistory) {
      eventsToArchive.push(event);
    }
  }
  
  console.log(`  Events to archive: ${eventsToArchive.length}`);
  console.log(`  Already in history: ${endedEvents.length - eventsToArchive.length}`);
  
  // Add new events to history file
  if (eventsToArchive.length > 0) {
    const historyContent = fs.readFileSync(historyPath, 'utf-8');
    
    const eventCode = eventsToArchive.map(event => {
      return `  {
    title: '${event.title.replace(/'/g, "\\'")}',
    start: new Date('${event.start.toISOString()}'),
    end: new Date('${event.end.toISOString()}'),
    image: '${(event.image || '').replace(/'/g, "\\'")}',
    description: \`${(event.description || '').replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`,
    game: '${event.game}',
  }`;
    }).join(',\n');
    
    // Add to history file (before the closing bracket)
    const updatedHistory = historyContent.replace(
      /\];[\s]*$/,
      `,\n${eventCode}\n];`
    );
    
    fs.writeFileSync(historyPath, updatedHistory, 'utf-8');
    console.log(`  ✓ Added ${eventsToArchive.length} events to history`);
  }
  
  // Update current file with only active events
  const currentFileHeader = fs.readFileSync(currentPath, 'utf-8').split('\n').slice(0, 5).join('\n');
  const exportName = currentFile.replace('.js', '').replace(/([A-Z])/g, (match, p1, offset) => 
    offset === 0 ? match.toLowerCase() : match
  );
  
  const newCurrentCode = `${currentFileHeader.split('export')[0]}
export const ${exportName.replace(/-/g, '')} = [
${activeEvents.map(event => {
  return `  {
    title: '${event.title.replace(/'/g, "\\'")}',
    start: new Date('${event.start.toISOString()}'),
    end: new Date('${event.end.toISOString()}'),
    image: '${(event.image || '').replace(/'/g, "\\'")}',
    description: \`${(event.description || '').replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`,
    game: '${event.game}',
  }`;
}).join(',\n')}
];
`;
  
  fs.writeFileSync(currentPath, newCurrentCode, 'utf-8');
  console.log(`  ✓ Removed ${endedEvents.length} ended events from current file`);
  
  if (eventsToArchive.length > 0) {
    console.log(`\n  Archived events:`);
    eventsToArchive.forEach(e => {
      console.log(`    - ${e.title} (ended ${new Date(e.end).toISOString().split('T')[0]})`);
    });
  }
  
  return { archived: eventsToArchive.length, removed: endedEvents.length };
}

// Archive all games
const results = {
  'Zenless Zone Zero': await archiveGame('Zenless Zone Zero', 'scrapedZZZEvents.js', 'scrapedZZZHistoryEvents.js'),
  'Honkai: Star Rail': await archiveGame('Honkai: Star Rail', 'scrapedStarRailEvents.js', 'scrapedStarRailHistoryEvents.js'),
  'Genshin Impact': await archiveGame('Genshin Impact', 'scrapedEvents.js', 'scrapedGenshinHistoryEvents.js'),
};

// Summary
console.log(`\n${'='.repeat(80)}`);
console.log('SUMMARY');
console.log('='.repeat(80));

let totalArchived = 0;
let totalRemoved = 0;

for (const [game, result] of Object.entries(results)) {
  console.log(`${game}:`);
  console.log(`  Archived: ${result.archived} new events`);
  console.log(`  Removed: ${result.removed} ended events from current`);
  totalArchived += result.archived;
  totalRemoved += result.removed;
}

console.log(`\nTotal: ${totalArchived} events archived, ${totalRemoved} events removed from current`);
console.log('='.repeat(80));
console.log('✓ Archive complete!\n');
