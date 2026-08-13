import { getGeminiApiKeys } from './api/_keys.js';

// Setup mock environment variables to simulate N keys
const NUM_KEYS = 10000;
process.env.GEMINI_API_KEYS = Array.from({ length: NUM_KEYS }, (_, i) => `key_${i}`).join(',');

const start = performance.now();
const keys = getGeminiApiKeys();
const end = performance.now();

console.log(`Generated ${keys.length} keys in ${(end - start).toFixed(2)} ms.`);
