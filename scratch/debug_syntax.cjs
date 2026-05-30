// scratch/debug_syntax.cjs
const fs = require('fs');

try {
  const content = fs.readFileSync('/Users/carlliu/ochem-bot/api/chat.js', 'utf8');
  // Let's run a test compile or find what character is broken.
  // We can do this by using the `vm` module to compile the code.
  const vm = require('vm');
  new vm.Script(content);
  console.log("No syntax errors found!");
} catch (e) {
  console.log("Syntax error details:", e);
  if (e.stack) {
    console.log(e.stack);
  }
}
