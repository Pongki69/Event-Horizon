// checkDuplicates.js
// Check for duplicate events in Genshin Impact data files

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Checking for duplicates in Genshin Impact data...\n');

// Check JS file
const jsPath = path.join(__dirname, '..', 'src', 'data', 'scrapedGenshinHistoryEvents.js');
const { scrapedGenshinHistoryEvents } = await import(`file://${jsPath}?t=${Date.now()}`);

console.log(`Total events in JS file: ${scrapedGenshinHistoryEvents.length}\n`);

// Find duplicates by title + start date
const jsMap = new Map();
const jsDuplicates = [];

scrapedGenshinHistoryEvents.forEach((event, index) => {
  const key = `${event.title}|||${new Date(event.start).toISOString()}`;
  
  if (jsMap.has(key)) {
    jsDuplicates.push({
      title: event.title,
      start: new Date(event.start).toISOString(),
      firstIndex: jsMap.get(key),
      duplicateIndex: index
    });
  } else {
    jsMap.set(key, index);
  }
});

if (jsDuplicates.length > 0) {
  console.log(`❌ Found ${jsDuplicates.length} exact duplicates in JS file:`);
  jsDuplicates.forEach(dup => {
    console.log(`  - "${dup.title}" (${dup.start})`);
    console.log(`    First at index ${dup.firstIndex}, duplicate at index ${dup.duplicateIndex}`);
  });
} else {
  console.log('✅ No exact duplicates found in JS file');
}

// Check for events with same start date and similar titles (colon variants)
console.log('\n--- Checking for colon variants (e.g., "Event" vs "Event: Subtitle") ---\n');

const colonVariants = [];
const allEvents = Array.from(jsMap.keys()).map(key => {
  const [title, start] = key.split('|||');
  return { title, start };
});

for (let i = 0; i < allEvents.length; i++) {
  for (let j = i + 1; j < allEvents.length; j++) {
    const event1 = allEvents[i];
    const event2 = allEvents[j];
    
    // Check if they have the same start date
    if (event1.start === event2.start) {
      const title1 = event1.title;
      const title2 = event2.title;
      
      // Check if one title is a prefix of the other (before a colon)
      const baseTitle1 = title1.split(':')[0].trim();
      const baseTitle2 = title2.split(':')[0].trim();
      
      if (baseTitle1 === baseTitle2 && title1 !== title2) {
        colonVariants.push({
          shorter: title1.length < title2.length ? title1 : title2,
          longer: title1.length < title2.length ? title2 : title1,
          start: event1.start
        });
      }
    }
  }
}

if (colonVariants.length > 0) {
  console.log(`❌ Found ${colonVariants.length} colon variant duplicates in JS file:`);
  colonVariants.forEach(variant => {
    console.log(`  - "${variant.shorter}" vs "${variant.longer}"`);
    console.log(`    Start: ${variant.start}`);
  });
} else {
  console.log('✅ No colon variant duplicates found in JS file');
}

// Check JSON file
console.log('\n--- Checking JSON file ---\n');

const jsonPath = path.join(__dirname, '..', 'src', 'data', 'scrapedGenshinHistoryEvents.json');
const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

console.log(`Total events in JSON file: ${jsonData.length}\n`);

const jsonMap = new Map();
const jsonDuplicates = [];

jsonData.forEach((event, index) => {
  const key = `${event.title}|||${event.start}`;
  
  if (jsonMap.has(key)) {
    jsonDuplicates.push({
      title: event.title,
      start: event.start,
      firstIndex: jsonMap.get(key),
      duplicateIndex: index
    });
  } else {
    jsonMap.set(key, index);
  }
});

if (jsonDuplicates.length > 0) {
  console.log(`❌ Found ${jsonDuplicates.length} exact duplicates in JSON file:`);
  jsonDuplicates.forEach(dup => {
    console.log(`  - "${dup.title}" (${dup.start})`);
    console.log(`    First at index ${dup.firstIndex}, duplicate at index ${dup.duplicateIndex}`);
  });
} else {
  console.log('✅ No exact duplicates found in JSON file');
}

// Check for colon variants in JSON
const jsonColonVariants = [];
const allJsonEvents = Array.from(jsonMap.keys()).map(key => {
  const [title, start] = key.split('|||');
  return { title, start };
});

for (let i = 0; i < allJsonEvents.length; i++) {
  for (let j = i + 1; j < allJsonEvents.length; j++) {
    const event1 = allJsonEvents[i];
    const event2 = allJsonEvents[j];
    
    // Check if they have the same start date
    if (event1.start === event2.start) {
      const title1 = event1.title;
      const title2 = event2.title;
      
      // Check if one title is a prefix of the other (before a colon)
      const baseTitle1 = title1.split(':')[0].trim();
      const baseTitle2 = title2.split(':')[0].trim();
      
      if (baseTitle1 === baseTitle2 && title1 !== title2) {
        jsonColonVariants.push({
          shorter: title1.length < title2.length ? title1 : title2,
          longer: title1.length < title2.length ? title2 : title1,
          start: event1.start
        });
      }
    }
  }
}

if (jsonColonVariants.length > 0) {
  console.log(`\n❌ Found ${jsonColonVariants.length} colon variant duplicates in JSON file:`);
  jsonColonVariants.forEach(variant => {
    console.log(`  - "${variant.shorter}" vs "${variant.longer}"`);
    console.log(`    Start: ${variant.start}`);
  });
} else {
  console.log('\n✅ No colon variant duplicates found in JSON file');
}

console.log('\n=== Summary ===');
console.log(`JS file: ${jsDuplicates.length} exact duplicates, ${colonVariants.length} colon variants`);
console.log(`JSON file: ${jsonDuplicates.length} exact duplicates, ${jsonColonVariants.length} colon variants`);

if (jsDuplicates.length === 0 && colonVariants.length === 0 && jsonDuplicates.length === 0 && jsonColonVariants.length === 0) {
  console.log('\n✅ All clean! No duplicates found.');
} else {
  console.log('\n⚠️ Duplicates found! Run the scraper again to clean them up.');
}
