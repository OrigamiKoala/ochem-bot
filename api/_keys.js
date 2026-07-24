// api/_keys.js

/**
 * Centralized API key manager for Gemini / GenChem API keys.
 * Automatically scans and aggregates keys from:
 * 1. GEMINI_API_KEYS (comma-separated list)
 * 2. GEMINI_API_KEY / GEN_CHEM_API_KEY (single key)
 * 3. Numbered env vars like api_1..api_N, GEMINI_API_KEY_1..N, GEN_CHEM_API_KEY_1..N
 */
export function getGeminiApiKeys() {
    const keys = [];

    // 1. Comma-separated list
    if (process.env.GEMINI_API_KEYS) {
        const list = process.env.GEMINI_API_KEYS.split(',').map(k => k.trim()).filter(Boolean);
        keys.push(...list);
    }

    // 2. Standard single key env vars
    if (process.env.GEMINI_API_KEY) {
        const key = process.env.GEMINI_API_KEY.trim();
        if (key && !keys.includes(key)) keys.push(key);
    }
    if (process.env.GEN_CHEM_API_KEY) {
        const key = process.env.GEN_CHEM_API_KEY.trim();
        if (key && !keys.includes(key)) keys.push(key);
    }

    // 3. Numbered API keys (e.g. api_1, api_2, GEMINI_API_KEY_1, GEN_CHEM_API_KEY_1, etc.)
    const numberedKeysMap = new Map();

    // Scan all process.env keys dynamically
    for (const envKey of Object.keys(process.env)) {
        const match = envKey.match(/^(?:api|GEMINI_API_KEY|GEN_CHEM_API_KEY)_(\d+)$/i);
        if (match && process.env[envKey]) {
            const idx = parseInt(match[1], 10);
            const val = process.env[envKey].trim();
            if (val) {
                numberedKeysMap.set(idx, val);
            }
        }
    }

    // Fallback scan up to api_100 / GEMINI_API_KEY_100 in case process.env keys are non-enumerable
    for (let i = 1; i <= 100; i++) {
        const val = process.env[`api_${i}`] || process.env[`GEMINI_API_KEY_${i}`] || process.env[`GEN_CHEM_API_KEY_${i}`];
        if (val && !numberedKeysMap.has(i)) {
            const trimmed = val.trim();
            if (trimmed) {
                numberedKeysMap.set(i, trimmed);
            }
        }
    }

    // Sort by index for consistent ordering before shuffling
    const sortedIndices = Array.from(numberedKeysMap.keys()).sort((a, b) => a - b);
    for (const idx of sortedIndices) {
        const k = numberedKeysMap.get(idx);
        if (k && !keys.includes(k)) {
            keys.push(k);
        }
    }

    return keys;
}
