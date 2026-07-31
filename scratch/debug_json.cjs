// scratch/debug_json.cjs
const fs = require('fs');
const content = fs.readFileSync('api/chat.js', 'utf8');

function getBlock(name) {
  const startIdx = content.indexOf(name);
  if (startIdx === -1) throw new Error("Could not find " + name);
  const braceStart = content.indexOf('{', startIdx);
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = braceStart; i < content.length; i++) {
    const ch = content.charAt(i);
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return content.substring(braceStart, i + 1);
      }
    }
  }
}

for (let id of [6, 7, 8, 9]) {
  let raw = getBlock(`IChO Question Example ${id}:`);
  // Fix single quotes and backticks
  raw = raw.replace(/(?<!\\)((?:\\\\)*)\\(['`])/g, "$1$2");
  try {
    JSON.parse(raw);
    console.log(`Block ${id} parsed successfully`);
  } catch(e) {
    console.log(`Block ${id} failed:`, e.message);
    const pos = parseInt(e.message.match(/position (\d+)/)?.[1] || "0");
    console.log("Error context:", raw.substring(pos - 50, pos + 50));
  }
}
