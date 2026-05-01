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

    let lastError = null;
    let attemptIndex = 0;

    for (const modelId of models) {
        try {
            const isFallback = attemptIndex > 0;
            attemptIndex++;

            const parts = [{ text: prompt }];
            if (image) parts.push({ inline_data: { mime_type: 'image/jpeg', data: image } });

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

            const getPayload = (cachedName) => ({
                contents: [{ parts, role: 'user' }],
                ...(cachedName ? { cachedContent: cachedName } : {}),
                generationConfig: { maxOutputTokens, temperature, topP, topK: 40, response_mime_type: responseMimeType || "text/plain" },
                service_tier: serviceTier
            });

            const endpoint = stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
            const getUrl = (mid) => `https://generativelanguage.googleapis.com/v1beta/models/${mid}:${endpoint}&key=${API_KEY}`;

            if (cacheState) {
                const cacheName = await ensureCache(cacheLabel, modelId, API_KEY, cacheSystemText, cacheState);
                if (cacheName) {
                    const response = await fetch(getUrl(modelId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(getPayload(cacheName)) });
                    if (response.status === 429 || response.status === 503) {
                        lastError = { status: response.status, data: await response.json() };
                        cacheState.name = null; cacheState.expiry = 0;
                        continue;
                    }
                    if (response.ok) {
                        if (isFallback) res.setHeader('X-Model-Fallback', 'true');
                        if (stream) {
                            res.setHeader('Content-Type', 'text/event-stream');
                            res.setHeader('Cache-Control', 'no-cache');
                            res.setHeader('Connection', 'keep-alive');
                            return response.body.pipe(res);
                        }
                        return res.status(200).json(await response.json());
                    }
                    cacheState.name = null; cacheState.expiry = 0;
                }
            }

            const fallbackParts = cacheSystemText ? [{ text: cacheSystemText + "\n\n" + prompt }, ...parts.slice(1)] : parts;
            const response = await fetch(getUrl(modelId), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: fallbackParts }], generationConfig: { maxOutputTokens, temperature, topP, topK: 40, response_mime_type: responseMimeType || "text/plain" }, service_tier: serviceTier })
            });

            if (response.status === 429 || response.status === 503) {
                lastError = { status: response.status, data: await response.json() };
                continue;
            }
            if (response.ok) {
                if (isFallback) res.setHeader('X-Model-Fallback', 'true');
                if (stream) {
                    res.setHeader('Content-Type', 'text/event-stream');
                    res.setHeader('Cache-Control', 'no-cache');
                    res.setHeader('Connection', 'keep-alive');
                    return response.body.pipe(res);
                }
                return res.status(200).json(await response.json());
            }
            return res.status(response.status).json(await response.json());
        } catch (error) {
            lastError = { error: 'Failed to reach Gemini' };
            continue;
        }
    }
    res.status(lastError?.status || 500).json({ error: lastError?.data?.error?.message || 'All models busy' });
}