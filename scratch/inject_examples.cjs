// scratch/inject_examples.cjs
const fs = require('fs');

const chatContent = fs.readFileSync('/Users/carlliu/ochem-bot/api/chat.js', 'utf8');
const formattedText = fs.readFileSync('/Users/carlliu/ochem-bot/scratch/formatted_output.txt', 'utf8');

// We want to find the exact target lines in chat.js
// Specifically:
// "explanation": "a. Adding strong hydrochloric acid to hypochlorite..."
//   }
// ]
//
// Let's replace:
//   }
// ]
// with:
//   },
// <formattedText>
// ]

const target = `  }\n]`;
const replacement = `  },\n${formattedText}\n]`;

if (!chatContent.includes(target)) {
  throw new Error("Could not find the target end of Example 5 in chat.js!");
}

const updatedChatContent = chatContent.replace(target, replacement);
fs.writeFileSync('/Users/carlliu/ochem-bot/api/chat.js', updatedChatContent, 'utf8');
console.log("Successfully injected the IChO examples into api/chat.js!");
