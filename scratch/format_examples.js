// scratch/format_examples.js
const fs = require('fs');

// We will read generate.js, extract the examples, format them, and output them as a clean string to write.
const content = fs.readFileSync('/Users/carlliu/stress-sandbox/api/generate.js', 'utf8');

// The file generate.js has Example 6, 7, 8, 9.
// Let's parse them or extract the text between standard headers.
// Since they are written in JS as properties inside the string or as comments, let's see.
// Actually, let's extract them by reading the lines.
const lines = content.split('\n');
console.log("Total lines in generate.js:", lines.length);
