// cleanupOldImageFolders.js
// Script to remove old event folder structure after reorganization
// Run with: node scripts/cleanupOldImageFolders.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const imagesDir = path.join(__dirname, '..', 'public', 'images');

console.log('Cleaning up old image folder structure...\n');

// Game folders to keep
const keepFolders = ['genshin-impact', 'honkai-star-rail', 'zenless-zone-zero'];

// Get all directories
const allFolders = fs.readdirSync(imagesDir, { withFileTypes: true })
  .filter(dirent => dirent.isDirectory())
  .map(dirent => dirent.name);

let deleted = 0;

for (const folder of allFolders) {
  // Skip game folders
  if (keepFolders.includes(folder)) {
    continue;
  }
  
  const folderPath = path.join(imagesDir, folder);
  
  try {
    // Delete the folder and all its contents
    fs.rmSync(folderPath, { recursive: true, force: true });
    console.log(`✓ Deleted: ${folder}`);
    deleted++;
  } catch (error) {
    console.error(`✗ Error deleting ${folder}:`, error.message);
  }
}

console.log(`\n${'='.repeat(50)}`);
console.log(`CLEANUP COMPLETE`);
console.log(`${'='.repeat(50)}`);
console.log(`🗑 Folders deleted: ${deleted}`);
console.log(`${'='.repeat(50)}\n`);

console.log('Remaining structure:');
console.log('public/images/');
console.log('├── genshin-impact/');
console.log('│   ├── events/');
console.log('│   └── banners/');
console.log('├── honkai-star-rail/');
console.log('│   ├── events/');
console.log('│   └── banners/');
console.log('└── zenless-zone-zero/');
console.log('    ├── events/');
console.log('    └── banners/\n');
