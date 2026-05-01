// api/chat.js

// --- Explicit Context Caching for Generation ---
// We cache the large, static system instruction once and reuse the cache
// name across generation requests. This avoids re-processing ~800 tokens
// of rules/structure on every question batch (up to 90% input token discount).
let generationCacheName = null;
let generationCacheExpiry = 0; // epoch ms

// Grading caches — separate for learn vs normal mode
let gradingLearnCacheName = null;
let gradingLearnCacheExpiry = 0;
let gradingNormalCacheName = null;
let gradingNormalCacheExpiry = 0;

const GENERATION_SYSTEM_INSTRUCTION = `You are an expert organic chemistry professor generating practice problems.

Output JSON matching this structure exactly:
{
  "reactions": [
    {
      "qtype": "predict|mechanism|stereo",
      "reactants": "SMILES",
      "reagents": "Organic reagents in [[SMILES: ...]] and others in plain text. Top of arrow.",
      "conditions": "Solvents, temperature, time, etc. in plain text. Bottom of arrow.",
      "answer": "SMILES",
      "instructions": "Specific task",
      "explanation": "Detailed mechanism. Use [[SMILES: SMILES_STRING]] to draw mechanistic intermediates within the text."
    }
  ]
}

RULES:
MOST IMPORTANT: Make sure the reaction actually occurs to a significant extent, and make sure reactants/reagents are correct.
1. SPECIAL SYMBOLS — use these exact placeholder tokens instead:
   - {DELTA} for the heat/reflux triangle symbol
   - {deg} for the degree sign (e.g. "0 {deg}C", "-78 {deg}C")
   - {hv} for photochemical light (h nu)
   - {H2} for hydrogen gas (H_2)
   - {H+} for a proton/acid catalyst (H^+)
2. Write solvents and reagent names as plain text: "EtOH", "THF", "CH2Cl2", "H2", "H+", "H2O". Do NOT wrap them in \\text{}.
3. ORGANIC REAGENTS: ALWAYS use [[SMILES: ...]] in the 'reagents' field for organic molecules.
4. Make sure the SMILES syntax is strictly valid and uses full atomic representation. Do NOT use any abbreviations like OAc, Ph, Me, Et, Ts, tBu in SMILES strings!

SELF-VERIFICATION (mandatory):
Before finalizing each reaction, verify:
- Does this reaction actually work with these specific reagents and conditions? Would it appear in Clayden, Wade, or McMurry?
- Is the product the MAJOR product (not a minor side product)?
- Is the SMILES for both reactant and product chemically valid and balanced?
- Are the reagents compatible with each other (no unwanted side reactions)?
Replace failed reactions with a correct one.`;

const GRADING_LEARN_SYSTEM_INSTRUCTION = `You are grading a student's organic chemistry drawing.
Identify if the user's drawing matches the correct answer.

Act as a supportive organic chemistry tutor.
1. If 'Incorrect', identify the specific chemical error (e.g., regio/stereo, steric clash, valency, or incorrect mechanism step) and explain the principle/rule being violated.
2. Be encouraging.
3. STATED RULE: NEVER give the answer or SMILES. Be extremely concise (max 30 words).
4. Use LaTeX (e.g. \\( \\ce{H2SO4} \\)) for chemical formulas and math in your response.`;

const GRADING_NORMAL_SYSTEM_INSTRUCTION = `You are grading a student's organic chemistry drawing.
Identify if the user's drawing matches the correct answer.

Output ONLY 'Correct' or 'Incorrect: [Subtle hint (max 10 words)]'. Be extremely concise. NEVER reveal the answer or structure.
Use LaTeX (e.g. \\( \\ce{H2SO4} \\)) for chemical formulas and math in your response.`;

const CACHE_TTL_SECONDS = 3600; // 1 hour

/**
 * Generic cache manager. Creates a cache for the given system instruction
 * text and model, reusing it if it hasn't expired yet.
 * Returns { cacheName, cacheNameRef, cacheExpiryRef } or null on failure.
 */
async function ensureCache(label, modelId, apiKey, systemText, state) {
    const now = Date.now();

    // If cache exists and hasn't expired (with 60s buffer), reuse it
    if (state.name && now < state.expiry - 60000) {
        console.log(`[cache:${label}] Reusing existing cache: ${state.name}`);
        return state.name;
    }

    console.log(`[cache:${label}] Creating new cache for model: ${modelId}`);

    const cacheResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: `models/${modelId}`,
                contents: [{
                    parts: [{ text: systemText }],
                    role: 'user'
                }],
                ttl: `${CACHE_TTL_SECONDS}s`
            })
        }
    );

    if (!cacheResponse.ok) {
        const errData = await cacheResponse.json();
        console.error(`[cache:${label}] Failed to create cache:`, cacheResponse.status, errData);
        return null; // Graceful degradation — will fall back to non-cached path
    }

    const cacheData = await cacheResponse.json();
    state.name = cacheData.name;
    state.expiry = now + CACHE_TTL_SECONDS * 1000;

    console.log(`[cache:${label}] Cache created: ${state.name}, expires in ${CACHE_TTL_SECONDS}s`);
    return state.name;
}

// Cache state objects (mutable singletons)
const generationCacheState = { name: null, expiry: 0 };
const gradingLearnCacheState = { name: null, expiry: 0 };
const gradingNormalCacheState = { name: null, expiry: 0 };


export default async function handler(req, res) {
    // 1. Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { prompt, image, responseMimeType, task, gradeMode } = req.body;
    const API_KEY = process.env.GEMINI_API_KEY;

    if (!API_KEY) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    }

    // Task-based model routing: use the best model for question generation,
    // cheaper/faster models for grading and chat where speed matters more.
    const GENERATION_MODELS = [
        "gemini-3-flash-preview",          // Default question generation bot
        "gemini-2.5-flash",                // Best chemistry knowledge (Fallback 1)
        "gemini-3.1-flash-lite-preview",   // Fallback 2
    ];

    const GRADING_MODELS = [
        "gemini-3.1-flash-lite-preview",   // Fast, cheap — fine for image eval
        "gemini-3-flash-preview",          // Fallback 1
        "gemini-2.5-flash",                // Fallback 2
    ];

    const models = (task === 'generate') ? GENERATION_MODELS : GRADING_MODELS;

    // Use higher temperature for generation (variety), low for grading (consistency)
    const temperature = (task === 'generate') ? 1.5 : 0.2;
    const topP = (task === 'generate') ? 0.95 : 0.8;
    const maxOutputTokens = (task === 'generate') ? 8192 : 1024;

    let lastError = null;
    let attemptIndex = 0;

    for (const modelId of models) {
        try {
            const isFallback = attemptIndex > 0;
            attemptIndex++;
            console.log(`[${task || 'unknown'}] Attempting request with model: ${modelId}${isFallback ? ' (fallback)' : ''}`);

            const parts = [{ text: prompt }];
            if (image) {
                parts.push({
                    inline_data: {
                        mime_type: 'image/jpeg',
                        data: image
                    }
                });
            }

            // --- Explicit caching path for generation and grading tasks ---
            let cacheLabel = null;
            let cacheSystemText = null;
            let cacheState = null;

            if (task === 'generate') {
                cacheLabel = 'generation';
                cacheSystemText = GENERATION_SYSTEM_INSTRUCTION;
                cacheState = generationCacheState;
            } else if (task === 'grade' && gradeMode) {
                cacheLabel = `grading-${gradeMode}`;
                cacheSystemText = (gradeMode === 'learn')
                    ? GRADING_LEARN_SYSTEM_INSTRUCTION
                    : GRADING_NORMAL_SYSTEM_INSTRUCTION;
                cacheState = (gradeMode === 'learn')
                    ? gradingLearnCacheState
                    : gradingNormalCacheState;
            }

            if (cacheState) {
                const cacheName = await ensureCache(cacheLabel, modelId, API_KEY, cacheSystemText, cacheState);

                if (cacheName) {
                    // Cached path: system instruction is already cached,
                    // only send the dynamic user prompt
                    const response = await fetch(
                        `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${API_KEY}`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                contents: [{ parts, role: 'user' }],
                                cachedContent: cacheName,
                                generationConfig: {
                                    maxOutputTokens,
                                    temperature,
                                    topP,
                                    topK: 40,
                                    response_mime_type: responseMimeType || "text/plain",
                                },
                            })
                        }
                    );

                    if (response.status === 429 || response.status === 503) {
                        const errorData = await response.json();
                        console.warn(`Model ${modelId} reached limit/busy (${response.status}). Falling back...`, errorData);
                        lastError = { status: response.status, data: errorData };
                        // Invalidate cache since we're about to switch models
                        cacheState.name = null;
                        cacheState.expiry = 0;
                        continue;
                    }

                    if (!response.ok) {
                        const errorData = await response.json();
                        console.warn(`[cache:${cacheLabel}] Cached request failed (${response.status}), invalidating cache`, errorData);
                        // Cache may have expired or be invalid — clear it and retry without cache
                        cacheState.name = null;
                        cacheState.expiry = 0;
                        // Fall through to the non-cached path below
                    } else {
                        const data = await response.json();
                        console.log(`[cache:${cacheLabel}] Cache hit tokens:`, data.usageMetadata?.cachedContentTokenCount || 'N/A');
                        if (isFallback) res.setHeader('X-Model-Fallback', 'true');
                        return res.status(200).json(data);
                    }
                }
            }

            // --- Standard (non-cached) path for grading/chat or cache fallback ---
            // If this task normally uses a cache, prepend the system instruction
            // so the model still gets full context even without caching.
            const fallbackParts = (cacheSystemText)
                ? [{ text: cacheSystemText + "\n\n" + prompt }, ...parts.slice(1)]
                : parts;

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: fallbackParts }],
                    generationConfig: {
                        maxOutputTokens,
                        temperature,
                        topP: topP,
                        topK: 40,
                        response_mime_type: responseMimeType || "text/plain",
                    },
                })
            });

            // If we hit a rate limit (429) or the service is busy (503), try the next model
            if (response.status === 429 || response.status === 503) {
                const errorData = await response.json();
                console.warn(`Model ${modelId} reached limit/busy (${response.status}). Falling back...`, errorData);
                lastError = { status: response.status, data: errorData };
                continue;
            }

            // For other non-OK statuses, we assume it's a structural error and return immediately
            if (!response.ok) {
                const errorData = await response.json();
                const errorMessage = errorData.error?.message || 'Unknown upstream API error';
                console.error(`Gemini API Error with ${modelId}:`, response.status, errorData);
                return res.status(response.status).json({ error: errorMessage, status: response.status });
            }

            // Success!
            const data = await response.json();
            if (isFallback) res.setHeader('X-Model-Fallback', 'true');
            return res.status(200).json(data);

        } catch (error) {
            console.error(`Fetch Error with model ${modelId}:`, error);
            lastError = { error: 'Failed to reach Gemini' };
            // Continue to next model on network/transient fetch errors
            continue;
        }
    }

    // If we've exhausted all models
    const finalStatus = lastError?.status || 500;
    const finalMessage = lastError?.data?.error?.message || 'All available models are currently at capacity.';
    res.status(finalStatus).json({ error: finalMessage });
}