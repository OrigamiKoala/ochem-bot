// api/chat.js

// --- Explicit Context Caching for Generation ---
let generationCacheState = { name: null, expiry: 0 };
let gradingLearnCacheState = { name: null, expiry: 0 };
let gradingNormalCacheState = { name: null, expiry: 0 };

// --- Gen-Chem mode caches (separate from ochem) ---
let genchemGenerationCacheState = { name: null, expiry: 0 };
let genchemGradingLearnCacheState = { name: null, expiry: 0 };
let genchemGradingNormalCacheState = { name: null, expiry: 0 };

const CHALLENGE_PHILOSOPHY = `Write in the EXACT same style and format as the USNCO/IChO exams, but MUCH MUCH trickier than past exams. The questions should be unique and creative, not old questions with new numbers/compounds, and require advanced critical thinking and problem solving skills, and target conceptual understanding, not just plugging in memorized formulas. `;

const GENERATION_SYSTEM_INSTRUCTION = `Expert organic chemistry problem generator. Output JSON only:
{"reactions":[{"qtype":"predict|mechanism|stereo","reactants":"SMILES","reagents":"organic in [[SMILES: ...]], others plain text","conditions":"plain text","answer":"SMILES","instructions":"task","explanation":"detailed mechanism with [[SMILES: ...]] for intermediates"}]}

RULES:
- Reactions MUST actually occur. Verify against Clayden/Wade/McMurry.
- Symbols: {DELTA}=heat, {deg}=°, {hv}=hν, {H2}=H₂, {H+}=H⁺
- Plain text for solvents/reagents (EtOH, THF, H2O). No \\text{}.
- [[SMILES: ...]] for organic reagents. Valid SMILES only — no abbreviations (Ph, Me, Et, OAc, Ts, tBu).
- Product must be MAJOR product. SMILES must be valid and balanced.
- ${CHALLENGE_PHILOSOPHY}`;

const GENCHEM_GENERATION_SYSTEM_INSTRUCTION = `Expert chemistry professor generating olympiad problems (USNCO/IChO). Cover ALL general chemistry — not just organic.

Output JSON only:
{"reactions":[{"qtype":"predict|calculate|conceptual|mechanism","reactants":"","reagents":"","conditions":"","answer":"SMILES/formula/numeric with units","instructions":"FULL COMPLETE QUESTION TEXT here. Include all data, context, and task. Use LaTeX for math. This is the ONLY field the student sees.","explanation":"detailed solution with LaTeX math and [[SMILES: ...]]"}]}

IMPORTANT: Put the ENTIRE question in 'instructions'. Leave reactants/reagents/conditions EMPTY — they are for organic reaction diagrams only.

RULES:
- Chemistry MUST be correct. Double-check calculations and products.
- Valid SMILES only, no abbreviations. Use [[SMILES: ...]] for structures in instructions/explanation.
- Calculations: show all steps in explanation, final answer with correct units and sig figs.
- VISUAL DIAGRAMS: For visual questions, embed LaTeX in 'instructions'. Use arrays/matrices for tables.
- ${CHALLENGE_PHILOSOPHY}`;

const GENCHEM_GRADING_LEARN_SYSTEM_INSTRUCTION = `Grade chemistry olympiad answer. If incorrect: identify specific error, explain principle violated. Be encouraging. NEVER reveal answer/SMILES. Max 30 words. Use LaTeX for formulas.`;

const GENCHEM_GRADING_NORMAL_SYSTEM_INSTRUCTION = `Grade chemistry olympiad answer. Output ONLY 'Correct' or 'Incorrect: [hint max 10 words]'. NEVER reveal answer. Use LaTeX for formulas.`;

const GRADING_LEARN_SYSTEM_INSTRUCTION = `Grade organic chemistry drawing. If incorrect: identify specific error (regio/stereo/valency/mechanism), explain principle violated. Be encouraging. NEVER reveal answer/SMILES. Max 30 words. Use LaTeX for formulas.`;

const GRADING_NORMAL_SYSTEM_INSTRUCTION = `Grade organic chemistry drawing. Output ONLY 'Correct' or 'Incorrect: [hint max 10 words]'. NEVER reveal answer. Use LaTeX for formulas.`;

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

    const { prompt, image, responseMimeType, task, gradeMode, stream, mode } = req.body;
    const isGenChem = mode === 'genchem';
    const API_KEY = isGenChem ? process.env.GEN_CHEM_API_KEY : process.env.GEMINI_API_KEY;
    if (!API_KEY) return res.status(500).json({ error: isGenChem ? 'GEN_CHEM_API_KEY missing' : 'GEMINI_API_KEY missing' });

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

            // Determine cache config (use separate caches for genchem mode)
            let cacheLabel = null, cacheSystemText = null, cacheState = null;
            if (task === 'generate') {
                cacheLabel = isGenChem ? 'genchem-generation' : 'generation';
                cacheSystemText = isGenChem ? GENCHEM_GENERATION_SYSTEM_INSTRUCTION : GENERATION_SYSTEM_INSTRUCTION;
                cacheState = isGenChem ? genchemGenerationCacheState : generationCacheState;
            } else if (task === 'grade' && gradeMode) {
                cacheLabel = isGenChem ? `genchem-grading-${gradeMode}` : `grading-${gradeMode}`;
                if (isGenChem) {
                    cacheSystemText = (gradeMode === 'learn') ? GENCHEM_GRADING_LEARN_SYSTEM_INSTRUCTION : GENCHEM_GRADING_NORMAL_SYSTEM_INSTRUCTION;
                    cacheState = (gradeMode === 'learn') ? genchemGradingLearnCacheState : genchemGradingNormalCacheState;
                } else {
                    cacheSystemText = (gradeMode === 'learn') ? GRADING_LEARN_SYSTEM_INSTRUCTION : GRADING_NORMAL_SYSTEM_INSTRUCTION;
                    cacheState = (gradeMode === 'learn') ? gradingLearnCacheState : gradingNormalCacheState;
                }
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