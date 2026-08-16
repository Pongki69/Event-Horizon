const fs = require('fs');

// Read the CSS file
const cssContent = fs.readFileSync('src/App.css', 'utf8');

// Find all media queries with their content
const mediaQueryPattern = /@media\s*\([^)]+\)\s*\{[^}]*(?:\{[^}]*\}[^}]*)*\}/g;

// Track duplicate media queries
const mediaQueries = new Map();
let modifiedContent = cssContent;

// Extract all media queries
const matches = [...cssContent.matchAll(/@media\s*(\([^)]+\))\s*\{/g)];

console.log('Found media queries:');
matches.forEach((match, index) => {
  const query = match[1];
  console.log(`${index + 1}. Line ${match.index}: @media ${query}`);
  
  if (!mediaQueries.has(query)) {
    mediaQueries.set(query, []);
  }
  mediaQueries.set(query, [...mediaQueries.get(query), match.index]);
});

// Find duplicates
console.log('\n\nDuplicate media queries:');
for (const [query, positions] of mediaQueries.entries()) {
  if (positions.length > 1) {
    console.log(`\n@media ${query} appears ${positions.length} times`);
  }
}
