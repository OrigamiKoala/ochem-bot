// scratch/check_octal.cjs
const fs = require('fs');
const content = fs.readFileSync('/Users/carlliu/ochem-bot/scratch/formatted_output.txt', 'utf8');

// Find all occurrences of backslash followed by a digit
const regex = /\\[0-9]/g;
let match;
while ((match = regex.exec(content)) !== null) {
  console.log(`Found possible octal escape at index ${match.index}: ${match[0]}`);
  console.log("Context:", content.substring(match.index - 20, match.index + 20));
}
