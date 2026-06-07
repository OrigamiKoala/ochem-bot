import fs from 'fs';
const appContent = fs.readFileSync('src/App.jsx', 'utf8');
const fetchMatches = appContent.match(/fetchBatchReactions/g);
console.log("fetchBatchReactions occurrences:", fetchMatches.length);
