// api/chat.js

// --- Explicit Context Caching for Generation ---
let generationCacheState = { name: null, expiry: 0 };
let gradingLearnCacheState = { name: null, expiry: 0 };
let gradingNormalCacheState = { name: null, expiry: 0 };

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

async function ensureCache(label, modelId, apiKey, systemText, state) {
    const now = Date.now();
    if (state.name && now < state.expiry - 60000) return state.name;

    const cacheResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: `models/${modelId}`,
                contents: [{ parts: [{ text: systemText }], role: 'user' }],
                ttl: `${CACHE_TTL_SECONDS}s`
            })
        }
    );

    if (!cacheResponse.ok) return null;

    const cacheData = await cacheResponse.json();
    state.name = cacheData.name;
    state.expiry = now + CACHE_TTL_SECONDS * 1000;
    return state.name;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { prompt, image, responseMimeType, task, gradeMode, stream } = req.body;
    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY missing' });

    const GENERATION_MODELS = ["gemini-3-flash-preview", "gemini-2.5-flash", "gemini-3.1-flash-lite-preview"];
    const GRADING_MODELS = ["gemini-3.1-flash-lite-preview", "gemini-3-flash-preview", "gemini-2.5-flash"];
    const models = (task === 'generate') ? GENERATION_MODELS : GRADING_MODELS;

    const temperature = (task === 'generate') ? 1.5 : 0.2;
    const topP = (task === 'generate') ? 0.95 : 0.8;
    const maxOutputTokens = (task === 'generate') ? 8192 : 1024;
    const serviceTier = "priority";

    // Build URL correctly — streaming endpoint already has ?, non-streaming needs ?
    function buildUrl(modelId) {
        if (stream) {
            return `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?alt=sse&key=${API_KEY}`;
        }
        return `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${API_KEY}`;
    }

    // Pipe a Web ReadableStream to a Node.js ServerResponse (Vercel compatible)
    async function pipeStreamToResponse(webStream, res) {
        const reader = webStream.getReader();
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                res.write(value);
            }
        } finally {
            reader.releaseLock();
            res.end();
        }
    }

    let lastError = null;
    let attemptIndex = 0;

    for (const modelId of models) {
        try {
            const isFallback = attemptIndex > 0;
            attemptIndex++;
            console.log(`[${task || 'chat'}] Trying model ${attemptIndex}/${models.length}: ${modelId}${isFallback ? ' (fallback)' : ''}`);

            const parts = [{ text: prompt }];
            if (image) parts.push({ inline_data: { mime_type: 'image/jpeg', data: image } });

            // Determine cache config
            let cacheLabel = null, cacheSystemText = null, cacheState = null;
            if (task === 'generate') {
                cacheLabel = 'generation';
                cacheSystemText = GENERATION_SYSTEM_INSTRUCTION;
                cacheState = generationCacheState;
            } else if (task === 'grade' && gradeMode) {
                cacheLabel = `grading-${gradeMode}`;
                cacheSystemText = (gradeMode === 'learn') ? GRADING_LEARN_SYSTEM_INSTRUCTION : GRADING_NORMAL_SYSTEM_INSTRUCTION;
                cacheState = (gradeMode === 'learn') ? gradingLearnCacheState : gradingNormalCacheState;
            }

            const genConfig = { maxOutputTokens, temperature, topP, topK: 40, response_mime_type: responseMimeType || "text/plain" };

            // --- Try cached path first ---
            if (cacheState) {
                let cacheName = null;
                try {
                    cacheName = await ensureCache(cacheLabel, modelId, API_KEY, cacheSystemText, cacheState);
                } catch (cacheErr) {
                    console.warn(`[cache:${cacheLabel}] ensureCache threw for ${modelId}:`, cacheErr.message);
                }

                if (cacheName) {
                    const payload = {
                        contents: [{ parts, role: 'user' }],
                        cachedContent: cacheName,
                        generationConfig: genConfig,
                        service_tier: serviceTier
                    };

                    const response = await fetch(buildUrl(modelId), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    if (response.ok) {
                        console.log(`[${task}] Success with ${modelId} (cached path)`);
                        if (isFallback) res.setHeader('X-Model-Fallback', 'true');
                        if (stream) {
                            res.setHeader('Content-Type', 'text/event-stream');
                            res.setHeader('Cache-Control', 'no-cache');
                            res.setHeader('Connection', 'keep-alive');
                            return await pipeStreamToResponse(response.body, res);
                        }
                        return res.status(200).json(await response.json());
                    }

                    // Cached request failed — invalidate and try next approach
                    const errBody = await response.json().catch(() => ({}));
                    console.warn(`[cache:${cacheLabel}] ${modelId} returned ${response.status}, invalidating cache`, errBody);
                    cacheState.name = null;
                    cacheState.expiry = 0;
                    lastError = { status: response.status, data: errBody };

                    // Server errors → skip to next model entirely
                    if (response.status >= 500 || response.status === 429) {
                        continue;
                    }
                    // 4xx → fall through to non-cached path for same model
                }
            }

            // --- Non-cached path ---
            const fallbackParts = cacheSystemText
                ? [{ text: cacheSystemText + "\n\n" + prompt }, ...parts.slice(1)]
                : parts;

            const response = await fetch(buildUrl(modelId), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: fallbackParts }],
                    generationConfig: genConfig,
                    service_tier: serviceTier
                })
            });

            if (response.ok) {
                console.log(`[${task}] Success with ${modelId} (non-cached path)`);
                if (isFallback) res.setHeader('X-Model-Fallback', 'true');
                if (stream) {
                    res.setHeader('Content-Type', 'text/event-stream');
                    res.setHeader('Cache-Control', 'no-cache');
                    res.setHeader('Connection', 'keep-alive');
                    return await pipeStreamToResponse(response.body, res);
                }
                return res.status(200).json(await response.json());
            }

            // Failed — log and try next model
            const errBody = await response.json().catch(() => ({}));
            console.warn(`[${task}] ${modelId} returned ${response.status}, trying next model...`, errBody);
            lastError = { status: response.status, data: errBody };
            continue;

        } catch (error) {
            console.error(`[${task}] Exception with ${modelId}:`, error.message);
            lastError = { status: 500, data: { error: { message: error.message || 'Failed to reach Gemini' } } };
            continue;
        }
    }

    console.error(`[${task}] All ${models.length} models exhausted. Last error:`, lastError);
    res.status(lastError?.status || 500).json({
        error: lastError?.data?.error?.message || 'All models are currently at capacity. Please try again later.'
    });
}