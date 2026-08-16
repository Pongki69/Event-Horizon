// generateZZZEventsFromImages.js
// Generate ZZZ event data from existing images
// Run with: node scripts/generateZZZEventsFromImages.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const imagesDir = path.join(__dirname, '..', 'public', 'images', 'zenless-zone-zero', 'events');

console.log('🖼️  Generating ZZZ events from images...\n');

// Read all image files
const imageFiles = fs.readdirSync(imagesDir).filter(f => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'));

console.log(`📊 Found ${imageFiles.length} images\n`);

const events = [];

for (const filename of imageFiles) {
  // Extract date from filename (format: event-name-YYYY-MM-DD.png)
  const dateMatch = filename.match(/(\d{4})-(\d{2})-(\d{2})/);
  
  if (!dateMatch) {
    console.log(`⚠️  Skipping ${filename} - no date found`);
    continue;
  }
  
  const [, year, month, day] = dateMatch;
  
  // Extract event name (everything before the date)
  const nameWithDate = filename.replace(/\.(png|jpg|jpeg)$/i, '');
  const eventName = nameWithDate.replace(/-\d{4}-\d{2}-\d{2}$/, '')
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  
  // Create start date (at 11:00 UTC+8 which is 03:00 UTC)
  const startDate = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), 3, 0, 0));
  
  // Create end date (14 days later at 03:59 UTC+8 which is 19:59 previous day UTC)
  const endDate = new Date(startDate.getTime() + (14 * 24 * 60 * 60 * 1000));
  endDate.setUTCHours(19, 59, 0, 0);
  
  events.push({
    title: eventName,
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    timezone: 'UTC+8',
    image: `/images/zenless-zone-zero/events/${filename}`,
    description: `${eventName} is an event in Zenless Zone Zero.`,
    game: 'Zenless Zone Zero',
    wikiUrl: ''
  });
}

// Sort by start date (newest first)
events.sort((a, b) => new Date(b.start) - new Date(a.start));

console.log(`✅ Generated ${events.length} events\n`);

// Write JSON
const jsonPath = path.join(__dirname, '..', 'src', 'data', 'scrapedZZZHistoryEvents.json');
fs.writeFileSync(jsonPath, JSON.stringify(events, null, 2));
console.log(`💾 Saved to: ${jsonPath}\n`);

// Write JS
const jsCode = `// scrapedZZZHistoryEvents.js
// Auto-generated from images
// Last updated: ${new Date().toISOString()}

export const scrapedZZZHistoryEvents = [
${events.map(event => `  {
    title: '${event.title.replace(/'/g, "\\'")}',
    start: new Date('${event.start}'),
    end: new Date('${event.end}'),
    timezone: '${event.timezone}',
    image: '${event.image.replace(/'/g, "\\'")}',
    description: \`${event.description.replace(/`/g, '\\`')}\`,
    game: 'Zenless Zone Zero',
    wikiUrl: '',
  }`).join(',\n')}
];
`;

const jsPath = path.join(__dirname, '..', 'src', 'data', 'scrapedZZZHistoryEvents.js');
fs.writeFileSync(jsPath, jsCode);
console.log(`💾 Saved to: ${jsPath}\n`);

console.log('🎉 Done!\n');
