// api/chat.js

// --- Explicit Context Caching for Generation ---
let generationCacheState = { name: null, expiry: 0 };
let gradingLearnCacheState = { name: null, expiry: 0 };
let gradingNormalCacheState = { name: null, expiry: 0 };

// --- Gen-Chem mode caches (separate from ochem) ---
let genchemGenerationCacheState = { name: null, expiry: 0 };
let genchemGradingLearnCacheState = { name: null, expiry: 0 };
let genchemGradingNormalCacheState = { name: null, expiry: 0 };

// --- Free Draw mode caches ---
let freedrawGradingLearnCacheState = { name: null, expiry: 0 };
let freedrawGradingNormalCacheState = { name: null, expiry: 0 };

const CHALLENGE_PHILOSOPHY = `System Prompt: You are an expert examiner creating questions for high-stakes competitive olympiad exams.


Follow these strict Olympiad Design Philosophies:

1. Novelty & "Invisible Traps" (Subtle Conceptual Bottlenecks)
- Banish stock, predictable questions that can be solved by memory or template-matching. 
- Every problem must center on a non-obvious conceptual trick, a hidden limiting factor, or a subtle breakdown of a standard textbook assumption.
- The question text must remain entirely neutral. NEVER include hints, warnings, or clarifying instructions (e.g., "Do not assume...", "Account for...", "Do not rely on..."). 
- Incorporate a deceptive path: design the problem so that the most common rote formula shortcut yields an exact numerical value or structural choice that perfectly matches one of the incorrect distractor options.

2. Difficulty-Dependent Syllabus Boundaries
- IF DIFFICULTY = USNCO National Level:
  - Maintain the USNCO scope but test to maximum depth.
  - EXCLUDE named physical chemistry rules/equations outside standard AP/USNCO curricula (e.g., Trouton's rule, Eyring-Polanyi equation, explicit activity coefficients).
  - EXCLUDE advanced stereochemical control and transition-state geometry (e.g., Bürgi-Dunitz trajectories, advanced diastereoselectivity, stereospecific enolate alkylations).
  - EXCLUDE advanced coordination chemistry (e.g., Crystal Field Theory, $t_{2g}$/$e_g$ orbital splitting, high-spin/low-spin complexes, Jahn-Teller effects). Confine coordination questions to basic nomenclature, coordination number, and oxidation states.
  - EXCLUDE all calculus-based derivations or principles.
  - EXCLUDE advanced spectroscopy (e.g., 2D-NMR).
  - Increase difficulty by coupling unexpected systems (e.g., matching a non-trivial stoichiometry with an electrochemical change that alters concentration ratios, or an organic reaction where a common functional group exhibits atypical reactivity due to adjacent electronic effects).
- IF DIFFICULTY = IChO Level:
  - Pivot to completely original, concept-first designs leveraging advanced chemical phenomena.
  - The "First-Principles" Guardrail: Introduce advanced, extra-syllabus topics using self-contained, axiomatic background information within the problem preamble. A student must be able to deduce the correct path using standard prerequisites combined with the provided context.
All questions generated MUST adhere to these critical design directives:

1. QUESTION STYLE & TRICKINESS: Do NOT make every single question a trap question; instead, provide a mix of standard and tricky questions:
   - For difficulty levels 1 to 4: Standard, straightforward conceptual or algorithmic questions must be used.
   - For difficulty levels 5 to 10: Questions can either be tricky (presenting sophisticated conceptual traps or subtle edge cases that penalize rote formula-plugging) OR they can be standard, non-trick questions that are highly difficult and challenging in their own right (demanding deep logic, multi-step reasoning, or integration of multiple foundational concepts).
   - Under no circumstances should any question require obscure, highly specialized research-level details, graduate-level knowledge, or any college-level content. All questions must be strictly competitive high school level or below. Problems must be completely solvable and scientifically/mathematically rigorous if the student deeply understands core principles. For multiple_choice questions involving traps, craft the distractor options to precisely match the results of common conceptual mistakes.
2. BALANCED TOPIC DIVERSITY: The exam must cover a wide, diverse range of standard topics/subjects within the chosen field (e.g., for Chemistry, include thermodynamics, kinetics, stoichiometry, organic synthesis, coordination chemistry, etc.). Do NOT let any single topic dominate the entire exam. Distribute the questions evenly across a broad variety of core topics/subjects in the syllabus.

Follow these strict rules:
1. Question Style: Provide a balanced mix of standard and tricky questions. Standard questions should only be generated for difficulty levels 1-4. For difficulty levels 5-10, make questions either tricky with conceptual traps, or standard but highly difficult in their own right. Do NOT use obscure, highly specialized research-level details.
2. The exam must span a wide, diverse range of standard topics in chemistry. Do NOT let any single topic dominate the entire exam. Distribute the questions across a broad variety of core topics in the standard syllabus.`;

const GENERATION_SYSTEM_INSTRUCTION = `Expert organic chemistry problem generator. Output JSON only:
{"reactions":[{"qtype":"predict|mechanism|stereo","reactants":"SMILES","reagents":"organic in [[SMILES: ...]], inorganic as LaTeX (wrapped in inline math delimiters $...$)","conditions":"plain text","answer":"SMILES","instructions":"task","hint":"a brief helpful hint that nudges the student toward the right approach WITHOUT revealing the answer — e.g. mention a key reagent role, or highlight a functional group to focus on","explanation":"detailed mechanism with [[SMILES: ...]] for intermediates"}]}

RULES:
- Reactions MUST actually occur. Verify against Clayden/Wade/McMurry.
- Symbols: {DELTA}=heat, {deg}=°, {hv}=hν, {H2}=H₂, {H+}=H⁺
- Plain text for solvents/reagents (EtOH, THF, H2O). No \\text{}.
- [[SMILES: ...]] for organic compounds and LaTeX for inorganic compounds/ions (which MUST be wrapped in inline math delimiters $...$, e.g. $\\ce{H2SO4}$).
- Product must be MAJOR product. SMILES must be valid and balanced.
- ${CHALLENGE_PHILOSOPHY}`;

const GENCHEM_GENERATION_SYSTEM_INSTRUCTION = `Expert chemistry professor generating olympiad problems (USNCO/IChO). Cover ALL general chemistry — not just organic.

Output JSON only:
{"reactions":[{"qtype":"predict|calculate|conceptual|mechanism","reactants":"","reagents":"","conditions":"","answer":"LaTeX formula/numeric with units","instructions":"FULL COMPLETE QUESTION TEXT here. Include all data, context, and task. Use LaTeX for math. This is the ONLY field the student sees.","hint":"a brief helpful hint that nudges the student toward the right approach WITHOUT revealing the answer — e.g. name a relevant law, suggest a starting equation, or highlight a key concept","explanation":"detailed solution with LaTeX math and [[SMILES: ...]]"}]}

IMPORTANT: Put the ENTIRE question in 'instructions'. Leave reactants/reagents/conditions EMPTY — they are for organic reaction diagrams only.

RULES:
- Chemistry MUST be correct. Double-check calculations and products.
- For inorganic compounds/ions, ALWAYS output LaTeX formulas (e.g. $\\ce{H2SO4}$, $\\ce{MnO4^-}$) wrapped in inline math delimiters ($...$) instead of SMILES in the answer and explanations.
- ALWAYS wrap ALL LaTeX formulas, chemical equations, symbols, units, and expressions in inline math delimiters ($...$) or block math delimiters ($$...$$). For example, write $\\Delta G$, $\\ce{H2O}$, or $\\text{kJ/mol}$.
- ONLY use SMILES and [[SMILES: ...]] if the compound is organic (3 or more carbon atoms).
- Valid SMILES only, no abbreviations. Use [[SMILES: ...]] for structures in instructions/explanation.
- Calculations: show all steps in explanation, final answer with correct units and sig figs.
- VISUAL DIAGRAMS: For visual questions, embed LaTeX in 'instructions'. Use arrays/matrices for tables.
- ${CHALLENGE_PHILOSOPHY}`;

const GENCHEM_GRADING_LEARN_SYSTEM_INSTRUCTION = `Grade chemistry olympiad answer. If incorrect: identify specific error, explain principle violated. Be encouraging. NEVER reveal answer/SMILES. Max 30 words. ALWAYS wrap ALL LaTeX formulas, chemical formulas (like $\\ce{H2O}$), and chemical equations in inline math delimiters ($...$).`;

const GENCHEM_GRADING_NORMAL_SYSTEM_INSTRUCTION = `Grade chemistry olympiad answer. Output ONLY 'Correct' or 'Incorrect: [hint max 10 words]'. NEVER reveal answer. ALWAYS wrap ALL LaTeX formulas, chemical formulas (like $\\ce{H2O}$), and chemical equations in inline math delimiters ($...$).`;

const FREEDRAW_GRADING_LEARN_SYSTEM_INSTRUCTION = `You are evaluating a chemistry mechanism drawing submitted WITHOUT a specific question prompt. The student drew a mechanism of their choosing. Evaluate it for:
1. Chemical plausibility (do the electron-pushing arrows make sense?)
2. Correct use of formal charges and lone pairs
3. Reasonable intermediates and products
4. Proper arrow notation
Identify the reaction type if recognizable. Point out specific errors (e.g. impossible bond formation, incorrect electron flow, valency violations). Be encouraging and educational. Max 50 words. ALWAYS wrap ALL LaTeX formulas, chemical formulas (like $\\ce{H2O}$), and chemical equations in inline math delimiters ($...$), and use [[SMILES: ...]] for structures.`;

const FREEDRAW_GRADING_NORMAL_SYSTEM_INSTRUCTION = `You are evaluating a chemistry mechanism drawing submitted WITHOUT a specific question prompt. The student drew a mechanism of their choosing. Assess chemical plausibility. Output ONLY: 'Plausible: [brief comment]' or 'Implausible: [brief reason]'. Max 15 words. ALWAYS wrap ALL LaTeX formulas, chemical formulas (like $\\ce{H2O}$), and chemical equations in inline math delimiters ($...$).`;

const GRADING_LEARN_SYSTEM_INSTRUCTION = `Grade organic chemistry drawing. If incorrect: identify specific error (regio/stereo/valency/mechanism), explain principle violated. Be encouraging. NEVER reveal answer/SMILES. Max 30 words. ALWAYS wrap ALL LaTeX formulas, chemical formulas (like $\\ce{H2O}$), and chemical equations in inline math delimiters ($...$).`;

const GRADING_NORMAL_SYSTEM_INSTRUCTION = `Grade organic chemistry drawing. Output ONLY 'Correct' or 'Incorrect: [hint max 10 words]'. NEVER reveal answer. ALWAYS wrap ALL LaTeX formulas, chemical formulas (like $\\ce{H2O}$), and chemical equations in inline math delimiters ($...$).`;

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
    const isFreeDraw = mode === 'freedraw';
    const API_KEY = isGenChem ? process.env.GEN_CHEM_API_KEY : process.env.GEMINI_API_KEY;
    if (!API_KEY) return res.status(500).json({ error: isGenChem ? 'GEN_CHEM_API_KEY missing' : 'GEMINI_API_KEY missing' });

    const GENERATION_MODELS = ["gemini-3.5-flash", "gemini-3-flash-preview", "gemini-2.5-flash", "gemini-3.1-flash-lite"];
    const GRADING_MODELS = ["gemini-3.1-flash-lite", "gemini-3-flash-preview", "gemini-2.5-flash"];
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
                if (isFreeDraw) {
                    cacheLabel = `freedraw-grading-${gradeMode}`;
                    cacheSystemText = (gradeMode === 'learn') ? FREEDRAW_GRADING_LEARN_SYSTEM_INSTRUCTION : FREEDRAW_GRADING_NORMAL_SYSTEM_INSTRUCTION;
                    cacheState = (gradeMode === 'learn') ? freedrawGradingLearnCacheState : freedrawGradingNormalCacheState;
                } else if (isGenChem) {
                    cacheLabel = `genchem-grading-${gradeMode}`;
                    cacheSystemText = (gradeMode === 'learn') ? GENCHEM_GRADING_LEARN_SYSTEM_INSTRUCTION : GENCHEM_GRADING_NORMAL_SYSTEM_INSTRUCTION;
                    cacheState = (gradeMode === 'learn') ? genchemGradingLearnCacheState : genchemGradingNormalCacheState;
                } else {
                    cacheLabel = `grading-${gradeMode}`;
                    cacheSystemText = (gradeMode === 'learn') ? GRADING_LEARN_SYSTEM_INSTRUCTION : GRADING_NORMAL_SYSTEM_INSTRUCTION;
                    cacheState = (gradeMode === 'learn') ? gradingLearnCacheState : gradingNormalCacheState;
                }
            }

            const genConfig = {
                maxOutputTokens,
                temperature,
                topP,
                topK: 40,
                response_mime_type: responseMimeType || "text/plain"
            };

            // Set thinking config based on model generation to prioritize gemini-3.5-flash with low thinking budget
            if (modelId.startsWith("gemini-3")) {
                genConfig.thinkingConfig = {
                    thinkingLevel: "LOW"
                };
            } else if (modelId.startsWith("gemini-2.5")) {
                genConfig.thinkingConfig = {
                    thinkingBudget: 1024
                };
            }

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