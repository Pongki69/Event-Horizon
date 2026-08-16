// Fix permanent events to have end: 'Indefinite' instead of dates
import fs from 'fs';

// Read the JS file
let content = fs.readFileSync('src/data/scrapedStarRailHistoryEvents.js', 'utf8');

// Replace all end dates for permanent events
// Find blocks with endNote and replace the end date before it
const lines = content.split('\n');
const newLines = [];
let skipNext = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  // Check if next few lines contain endNote: 'Permanent'
  let isPermanent = false;
  for (let j = i; j < Math.min(i + 5, lines.length); j++) {
    if (lines[j].includes("endNote: 'Permanent'")) {
      isPermanent = true;
      break;
    }
  }
  
  // If this is an end date line and the event is permanent, replace it
  if (isPermanent && line.includes('end: new Date(')) {
    newLines.push(line.replace(/end: new Date\('.*?'\),/, "end: 'Indefinite',"));
  } else {
    newLines.push(line);
  }
}

fs.writeFileSync('src/data/scrapedStarRailHistoryEvents.js', newLines.join('\n'));

console.log('✓ Fixed permanent events in .js file');

