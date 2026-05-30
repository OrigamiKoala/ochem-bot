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

// --- Rate limit memory registry to remember 429 keys for the rest of the day ---
let rateLimitRegistry = new Map();

function isKeyRateLimitedForModel(modelId, apiKey) {
    const today = new Date().toDateString();
    return rateLimitRegistry.get(`${modelId}:${apiKey}`) === today;
}

function markKeyRateLimitedForModel(modelId, apiKey) {
    const today = new Date().toDateString();
    rateLimitRegistry.set(`${modelId}:${apiKey}`, today);
}

const CHALLENGE_PHILOSOPHY = `System Prompt: You are an expert examiner creating questions for high-stakes competitive olympiad exams.


Follow these strict Olympiad Design Philosophies:

1. Novelty & "Invisible Traps" (Subtle Conceptual Bottlenecks)
- Focus on creating original, conceptually rich questions that demand first-principles reasoning instead of template-matching.
- Every problem must center on a non-obvious conceptual trick, a hidden limiting factor, or a subtle breakdown of a standard textbook assumption.
- Keep the question text entirely neutral. Present all necessary context and parameters clearly and let the student deduce the correct constraints on their own.
- Incorporate a deceptive path: design the problem so that the most common rote formula shortcut yields an exact numerical value or structural choice that perfectly matches one of the incorrect distractor options.

2. Difficulty-Dependent Syllabus Boundaries
- IF DIFFICULTY = USNCO National Level (40-75):
  - Stick strictly to standard AP/USNCO curricula, utilizing only foundational concepts.
  - Focus stereochemistry questions on basic configurations and simple diastereoselectivity.
  - Limit coordination chemistry questions to basic nomenclature, coordination number, and oxidation states.
  - Focus exclusively on algebra-based derivations and principles.
  - Limit spectroscopy to standard 1D-NMR, IR, and UV-Vis.
  - Increase difficulty by coupling unexpected systems (e.g., matching a non-trivial stoichiometry with an electrochemical change that alters concentration ratios, or an organic reaction where a common functional group exhibits atypical reactivity due to adjacent electronic effects).
- IF DIFFICULTY = IChO Level (75-100):
  - Pivot to completely original, concept-first designs leveraging advanced chemical phenomena.
  - The "First-Principles" Guardrail: Introduce advanced, extra-syllabus topics using self-contained, axiomatic background information within the problem preamble. A student must be able to deduce the correct path using standard prerequisites combined with the provided context.

3. Question Generation Criteria (For High-Difficulty Questions)
- Conceptual Integration (Multi-Topic Coupling): Standard questions isolate a single topic (e.g., a simple acid-base titration). High-quality difficult questions require the simultaneous application of disparate chemical principles. Example: Coupling a coordination chemistry equilibrium ($K_f$) with a solubility product ($K_{sp}$) and an electrochemical cell ($E^{\\circ}$), requiring the user to determine free ligand concentration via Nernst equation manipulation.
- Multi-Step Logical Cascades: The problem cannot be solved in a single algebraic or conceptual step. It requires a clear execution pathway where the output of one step forms the input of the next, often without explicit prompting on the intermediate variables. Example: Advanced organic synthesis/structure elucidation. Deducing a molecular structure from elemental analysis (empirical formula) $\\rightarrow$ mass spectrometry fragments $\\rightarrow$ IR functional groups $\\rightarrow$ regioselective multi-step mechanistic outcomes (e.g., ozonolysis followed by an intramolecular aldol condensation).
- Discrimination of Subtle Chemical Nuances: Distinguishes top-tier students by testing exceptions grounded in fundamental principles rather than rote memorization. Focuses on electronic structures, periodic trends, and thermodynamic vs. kinetic control. Example: Predicting the major product of an electrophilic aromatic substitution where steric hindrance and electronic activation conflict, or identifying anomalies in molecular orbital configurations (e.g., $B_2$ vs $O_2$ paramagnetism and bond orders).
- Mathematical and Algorithmic Rigor: Eliminates standard simplifying assumptions (e.g., the $x$-is-small approximation in weak acid ionization). Requires setting up and solving higher-order algebraic equations or systems of simultaneous equations derived from mass and charge balances. Example: Calculating the exact pH of a polyprotic acid solution where $K_{a2}$ is non-negligible or the solution is sufficiently dilute that water autoionization ($K_w$) must be factored into the charge balance equation:
$$\\text{[H}^+\\text{]} = \\text{[OH}^-\\text{]} + \\text{[A}^-\\text{]} + 2\\text{[A}^{2-}\\text{]}$$
- Novel Context and Data Interpretation: Presents familiar chemical principles within an unfamiliar framework (e.g., bioinorganic active sites, industrial catalytic cycles, or cutting-edge materials chemistry like Metal-Organic Frameworks). Requires the student to extract relevant thermodynamic, kinetic, or structural variables from raw data tables or graphical representations (e.g., phase diagrams with unexpected polymorphs).

All questions generated MUST adhere to these critical design directives:

1. QUESTION STYLE & TRICKINESS: Provide a balanced combination of standard and tricky questions:
   - For difficulty levels 10 to 40: Standard, straightforward conceptual or algorithmic questions must be used.
   - For difficulty levels 50 to 100: Questions can either be tricky (presenting sophisticated conceptual traps or subtle edge cases that penalize rote formula-plugging) OR they can be standard, non-trick questions that are highly difficult and challenging in their own right (demanding deep logic, multi-step reasoning, or integration of multiple foundational concepts).
   - Ensure all questions remain strictly competitive high school level or below, solvable through first-principles reasoning. Problems must be scientifically and mathematically rigorous, solvable by deeply applying core concepts. For multiple_choice questions involving traps, craft the distractor options to precisely match the results of common conceptual mistakes.
2. BALANCED TOPIC DIVERSITY: Ensure a balanced topic distribution. Distribute the questions evenly across a broad variety of core topics/subjects in the standard syllabus.

Follow these strict rules:
1. Question Style: Provide a balanced mix of standard and tricky questions. Standard questions should only be generated for difficulty levels 10-40. For difficulty levels 50-100, make questions either tricky with conceptual traps, or standard but highly difficult in their own right.
2. The exam must span a wide, diverse range of standard topics in chemistry. Distribute the questions across a broad variety of core topics in the standard syllabus.`;

const GENERATION_SYSTEM_INSTRUCTION = `Expert organic chemistry problem generator. Output JSON only:
{"reactions":[{"qtype":"predict|mechanism|stereo","reactants":"SMILES","reagents":"organic in [[SMILES: ...]], inorganic as LaTeX (wrapped in inline math delimiters $...$)","conditions":"plain text","answer":"SMILES","instructions":"task","hint":"a brief helpful hint that nudges the student toward the right approach while helping them discover the solution on their own — e.g. mention a key reagent role, or highlight a functional group to focus on","explanation":"detailed mechanism with [[SMILES: ...]] for intermediates"}]}

RULES:
- Reactions MUST actually occur. Verify against Clayden/Wade/McMurry.
- Symbols: {DELTA}=heat, {deg}=°, {hv}=hν, {H2}=H₂, {H+}=H⁺
- Write solvents and reagents in plain text (e.g. EtOH, THF, H2O) instead of utilizing LaTeX \\text{}.
- [[SMILES: ...]] for organic compounds and LaTeX for inorganic compounds/ions (which MUST be wrapped in inline math delimiters $...$, e.g. $\\ce{H2SO4}$).
- Product must be MAJOR product. SMILES must be valid and balanced.
- ${CHALLENGE_PHILOSOPHY}`;

const GENCHEM_GENERATION_SYSTEM_INSTRUCTION = `Expert chemistry professor generating olympiad problems (USNCO/IChO). Cover all general chemistry topics broadly, including inorganic, physical, analytical, and organic chemistry.

Output JSON only:
{"reactions":[{"qtype":"predict|calculate|conceptual|mechanism","reactants":"","reagents":"","conditions":"","answer":"LaTeX formula/numeric with units","instructions":"FULL COMPLETE QUESTION TEXT here. Include all data, context, and task. Use LaTeX for math. This is the ONLY field the student sees.","hint":"a brief helpful hint that nudges the student toward the right approach while helping them discover the solution on their own — e.g. name a relevant law, suggest a starting equation, or highlight a key concept","explanation":"detailed solution with LaTeX math and [[SMILES: ...]]"}]}

IMPORTANT: Put the ENTIRE question in 'instructions'. Leave reactants/reagents/conditions EMPTY — they are for organic reaction diagrams only.

FEW-SHOT EXAMPLES:
[
  {
    "qtype": "conceptual",
    "reactants": "",
    "reagents": "",
    "conditions": "",
    "answer": "(A)",
    "instructions": "A weighed sample of a copper-nickel alloy is dissolved in a known volume of nitric acid. Which method is most suitable for determining the mass percent of copper in the alloy?\n\n(A) Treatment of an aliquot of the solution with excess iodide, followed by titration of the iodine produced with sodium thiosulfate.\n(B) Measurement of the absorbance of the solution at a wavelength of light at which both $\\ce{Cu^{2+}}$ and $\\ce{Ni^{2+}}$ absorb, and comparison with the absorbances of known standards of the two ions.\n(C) Addition of excess sodium hydroxide to the solution, isolation of the metal hydroxides by filtration, and measurement of the mass of the precipitate.\n(D) Bubbling hydrogen gas through the solution and measuring the mass of the metal that precipitates from the solution.",
    "hint": "Recall the reactions of copper(II) and nickel(II) ions with iodide, and think about which method is highly selective for copper.",
    "explanation": "Dissolving a copper-nickel alloy in nitric acid produces $\\ce{Cu^{2+}}$ and $\\ce{Ni^{2+}}$ ions.\n\n1. In method (A), adding excess iodide ($\\ce{I^-}$) selectively reduces $\\ce{Cu^{2+}}$ to insoluble copper(I) iodide ($\\ce{CuI}$), producing triiodide/iodine ($\\ce{I_3^-}$ / $\\ce{I_2}$):\n$$2\\ce{Cu^{2+}} + 4\\ce{I^-} \\rightarrow 2\\ce{CuI(s)} + \\ce{I_2}$$\n$\\ce{Ni^{2+}}$ does not oxidize iodide. Titrating the liberated iodine with sodium thiosulfate ($\\ce{S_2O_3^{2-}}$) allows for highly selective and accurate quantification of copper:\n$$\\ce{I_2} + 2\\ce{S_2O_3^{2-}} \\rightarrow 2\\ce{I^-} + \\ce{S_4O_6^{2-}}$$\nThis iodometric titration is extremely selective for copper over nickel, making (A) the correct and most suitable method.\n\n2. Method (B) is unsuitable because both ions absorb light at the chosen wavelength, making direct comparison difficult without a multi-wavelength deconvolution method.\n3. Method (C) precipitates both metal hydroxides ($\\ce{Cu(OH)_2}$ and $\\ce{Ni(OH)_2}$), so their masses cannot be separated simply by weighing the precipitate.\n4. Method (D) cannot selectively precipitate copper in a strongly oxidizing nitric acid environment, nor is it a standard analytical procedure."
  },
  {
    "qtype": "conceptual",
    "reactants": "",
    "reagents": "",
    "conditions": "",
    "answer": "(B)",
    "instructions": "Which species has the longest carbon-oxygen bond?\n\n(A) $\\ce{HCO2^-}$\n(B) $\\ce{CO3^{2-}}$\n(C) $\\ce{CO2}$\n(D) $\\ce{COS}$",
    "hint": "Determine the Lewis structure and calculate the average carbon-oxygen bond order for each species. A lower bond order corresponds to a longer bond.",
    "explanation": "The length of a carbon-oxygen bond is inversely proportional to its bond order. Let's determine the carbon-oxygen bond orders in each species:\n\n1. For $\\ce{HCO2^-}$ (formate ion), the carbon has one double bond and one single bond to oxygen, which are delocalized by resonance. The average $\\ce{C-O}$ bond order is:\n$$\\text{Bond Order} = \\frac{1 + 2}{2} = 1.5$$\n\n2. For $\\ce{CO3^{2-}}$ (carbonate ion), the carbon is bonded to three oxygen atoms with one double bond and two single bonds in resonance. The average $\\ce{C-O}$ bond order is:\n$$\\text{Bond Order} = \\frac{1 + 1 + 2}{3} = 1.33$$\n\n3. For $\\ce{CO2}$ (carbon dioxide), the Lewis structure is $\\ce{O=C=O}$, which has two discrete $\\ce{C-O}$ double bonds. The bond order is $2.0$.\n\n4. For $\\ce{COS}$ (carbonyl sulfide), the Lewis structure is $\\ce{O=C=S}$, containing a $\\ce{C-O}$ double bond. The bond order is $2.0$.\n\nComparing the average bond orders, the carbonate ion ($\\ce{CO3^{2-}}$) has the lowest average bond order ($1.33$) and therefore the longest carbon-oxygen bond, making (B) the correct choice."
  },
  {
    "qtype": "conceptual",
    "reactants": "",
    "reagents": "",
    "conditions": "",
    "answer": "(D)",
    "instructions": "Which is the best description of the arrangement of the atoms in space in the protonated urea ion, $\\ce{H5CN2O^+}$?\n\n(A) SMILES: [[SMILES: NC(=O)[NH3+]]]\n(B) SMILES: [[SMILES: NC(=O)[NH3+]]]\n(C) SMILES: [[SMILES: N=C(O)N]]\n(D) SMILES: [[SMILES: NC(O)=[NH2+]]]",
    "hint": "Consider which atom in urea is the most nucleophilic due to resonance stabilization of the protonated cation.",
    "explanation": "Protonation of urea, $\\ce{(NH2)2C=O}$, occurs preferentially on the oxygen atom rather than the nitrogen atom.\n\n1. Protonation on the oxygen atom gives the cation $\\ce{[(NH2)2C=OH]^+}$. The positive charge in this cation is highly stabilized via resonance delocalization over both electronegative nitrogen atoms:\n$$\\ce{H2N-C(OH)=NH2^+} \\leftrightarrow \\ce{H2N^+=C(OH)-NH2} \\leftrightarrow \\ce{H2N-C(O^+H)-NH2}$$\nThis delocalization gives both $\\ce{C-N}$ bonds substantial double-bond character and makes the three heavy atoms (N, C, N) and O lie in the same plane.\n\n2. Protonation on nitrogen, yielding $\\ce{H2N-C(=O)-NH3^+}$, lacks this resonance stabilization because the positive charge on nitrogen cannot be delocalized since nitrogen has no lone pairs to participate in conjugation.\n\n3. The SMILES string representing oxygen protonation (specifically showing one resonance contributor with a $\\ce{C=N}$ double bond) is [[SMILES: NC(O)=[NH2+]]], which is option (D)."
  }
]

RULES:
- Chemistry MUST be correct. Double-check calculations and products.
- For inorganic compounds/ions, ALWAYS output LaTeX formulas (e.g. $\\ce{H2SO4}$, $\\ce{MnO4^-}$) wrapped in inline math delimiters ($...$) instead of SMILES in the answer and explanations.
- ALWAYS wrap ALL LaTeX formulas, chemical equations, symbols, units, and expressions in inline math delimiters ($...$) or block math delimiters ($$...$$). For example, write $\\Delta G$, $\\ce{H2O}$, or $\\text{kJ/mol}$.
- Reserve SMILES and [[SMILES: ...]] specifically for organic compounds containing 3 or more carbon atoms.
- Write fully valid, complete SMILES strings (avoiding abbreviations). Use the [[SMILES: ...]] format for structures in instructions and explanations.
- Calculations: show all steps in explanation, final answer with correct units and sig figs.
- VISUAL DIAGRAMS: For visual questions, embed LaTeX in 'instructions'. Use arrays/matrices for tables.
- ${CHALLENGE_PHILOSOPHY}`;

const GENCHEM_GRADING_LEARN_SYSTEM_INSTRUCTION = `Grade chemistry olympiad answer. If incorrect: identify specific error, explain principle violated. Be encouraging. Keep the correct answer and SMILES completely hidden, helping the student discover the solution on their own. Max 30 words. ALWAYS wrap ALL LaTeX formulas, chemical formulas (like $\\ce{H2O}$), and chemical equations in inline math delimiters ($...$).`;

const GENCHEM_GRADING_NORMAL_SYSTEM_INSTRUCTION = `Grade chemistry olympiad answer. Output ONLY 'Correct' or 'Incorrect: [hint max 10 words]'. Keep the correct answer completely hidden. ALWAYS wrap ALL LaTeX formulas, chemical formulas (like $\\ce{H2O}$), and chemical equations in inline math delimiters ($...$).`;

const FREEDRAW_GRADING_LEARN_SYSTEM_INSTRUCTION = `You are evaluating a chemistry mechanism drawing submitted WITHOUT a specific question prompt. The student drew a mechanism of their choosing. Evaluate it for:
1. Chemical plausibility (do the electron-pushing arrows make sense?)
2. Correct use of formal charges and lone pairs
3. Reasonable intermediates and products
4. Proper arrow notation
Identify the reaction type if recognizable. Point out specific errors (e.g. impossible bond formation, incorrect electron flow, valency violations). Be encouraging and educational. Max 50 words. ALWAYS wrap ALL LaTeX formulas, chemical formulas (like $\\ce{H2O}$), and chemical equations in inline math delimiters ($...$), and use [[SMILES: ...]] for structures.`;

const FREEDRAW_GRADING_NORMAL_SYSTEM_INSTRUCTION = `You are evaluating a chemistry mechanism drawing submitted WITHOUT a specific question prompt. The student drew a mechanism of their choosing. Assess chemical plausibility. Output ONLY: 'Plausible: [brief comment]' or 'Implausible: [brief reason]'. Max 15 words. ALWAYS wrap ALL LaTeX formulas, chemical formulas (like $\\ce{H2O}$), and chemical equations in inline math delimiters ($...$).`;

const GRADING_LEARN_SYSTEM_INSTRUCTION = `Grade organic chemistry drawing. If incorrect: identify specific error (regio/stereo/valency/mechanism), explain principle violated. Be encouraging. Keep the correct answer and SMILES completely hidden, helping the student discover the solution on their own. Max 30 words. ALWAYS wrap ALL LaTeX formulas, chemical formulas (like $\\ce{H2O}$), and chemical equations in inline math delimiters ($...$).`;

const GRADING_NORMAL_SYSTEM_INSTRUCTION = `Grade organic chemistry drawing. Output ONLY 'Correct' or 'Incorrect: [hint max 10 words]'. Keep the correct answer completely hidden. ALWAYS wrap ALL LaTeX formulas, chemical formulas (like $\\ce{H2O}$), and chemical equations in inline math delimiters ($...$).`;

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
    
    let keys = isGenChem
        ? [
            process.env.GEN_CHEM_API_KEY,
            process.env.GEN_CHEM_API_KEY_2,
            process.env.GEN_CHEM_API_KEY_3,
            process.env.GEMINI_API_KEY,
            process.env.GEMINI_API_KEY_2,
            process.env.GEMINI_API_KEY_3
          ].filter(Boolean)
        : [
            process.env.GEMINI_API_KEY,
            process.env.GEMINI_API_KEY_2,
            process.env.GEMINI_API_KEY_3,
            process.env.GEN_CHEM_API_KEY,
            process.env.GEN_CHEM_API_KEY_2,
            process.env.GEN_CHEM_API_KEY_3
          ].filter(Boolean);

    if (keys.length === 0) {
        return res.status(500).json({ error: 'All GEMINI_API_KEY and GEN_CHEM_API_KEY variants missing' });
    }

    const seedHeader = req.headers['x-session-key-seed'];
    const seed = seedHeader ? parseInt(seedHeader, 10) : null;
    if (seed !== null && !isNaN(seed)) {
        const startIndex = seed % keys.length;
        const selectedKey = keys.filter((_, idx) => idx === startIndex).pop();
        if (selectedKey) {
            const remainingKeys = keys.filter((_, idx) => idx !== startIndex);
            // Shuffle the remaining keys randomly without bracket notation to prevent dynamic property access warnings
            const shuffledRemaining = [];
            while (remainingKeys.length > 0) {
                const randIndex = Math.floor(Math.random() * remainingKeys.length);
                const removed = remainingKeys.splice(randIndex, 1).pop();
                if (removed) {
                    shuffledRemaining.push(removed);
                }
            }
            keys = [selectedKey, ...shuffledRemaining];
        }
    }

    const GENERATION_MODELS = ["gemini-3.5-flash", "gemini-3-flash-preview", "gemini-2.5-flash", "gemini-3.1-flash-lite"];
    const GRADING_MODELS = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3-flash-preview", "gemini-2.5-flash"];
    const models = (task === 'generate') ? GENERATION_MODELS : GRADING_MODELS;

    const temperature = (task === 'generate') ? 1.5 : 0.2;
    const topP = (task === 'generate') ? 0.95 : 0.8;
    const maxOutputTokens = (task === 'generate') ? 8192 : 1024;
    const serviceTier = undefined; // Avoid priority queueing overhead on standard keys

    // Build URL correctly
    function buildUrl(modelId, apiKey) {
        if (stream) {
            return `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?alt=sse&key=${apiKey}`;
        }
        return `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
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
        const isFallback = attemptIndex > 0;
        attemptIndex++;

        const parts = [{ text: prompt }];
        if (image) parts.push({ inline_data: { mime_type: 'image/jpeg', data: image } });

        async function tryModelWithKey(apiKey) {
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

            // Omit experimental thinking configurations to prioritize ultra-fast standard Flash default execution speed

            // --- Try cached path first ---
            if (cacheState) {
                let cacheName = null;
                try {
                    cacheName = await ensureCache(cacheLabel, modelId, apiKey, cacheSystemText, cacheState);
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

                    const response = await fetch(buildUrl(modelId, apiKey), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    const errBody = !response.ok ? await response.json().catch(() => ({})) : null;
                    return { response, errBody, isCached: true, cacheState };
                }
            }

            // --- Non-cached path ---
            const fallbackParts = cacheSystemText
                ? [{ text: cacheSystemText + "\n\n" + prompt }, ...parts.slice(1)]
                : parts;

            const response = await fetch(buildUrl(modelId, apiKey), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: fallbackParts }],
                    generationConfig: genConfig,
                    service_tier: serviceTier
                })
            });

            const errBody = !response.ok ? await response.json().catch(() => ({})) : null;
            return { response, errBody, isCached: false };
        }

        try {
            let keyIndex = 0;
            let success = false;

            for (const apiKey of keys) {
                const isKeyRateLimited = isKeyRateLimitedForModel(modelId, apiKey);
                if (isKeyRateLimited) {
                    console.warn(`[${task}] Key #${keyIndex + 1} is already rate limited for ${modelId} today. Skipping.`);
                    keyIndex++;
                    continue;
                }

                console.log(`[${task || 'chat'}] Trying model ${attemptIndex}/${models.length}: ${modelId}${isFallback ? ' (fallback)' : ''} with key #${keyIndex + 1}`);
                const result = await tryModelWithKey(apiKey);

                if (result.response.ok) {
                    console.log(`[${task}] Success with ${modelId} (key #${keyIndex + 1})`);
                    res.setHeader('X-Model-Used', modelId);
                    if (isFallback) res.setHeader('X-Model-Fallback', 'true');
                    if (stream) {
                        res.setHeader('Content-Type', 'text/event-stream');
                        res.setHeader('Cache-Control', 'no-cache');
                        res.setHeader('Connection', 'keep-alive');
                        return await pipeStreamToResponse(result.response.body, res);
                    }
                    return res.status(200).json(await result.response.json());
                }

                const status = result.response.status;
                const errBody = result.errBody;
                const isBusy = status === 503 || (errBody?.error?.message && /busy|overloaded/i.test(errBody.error.message));

                if (isBusy) {
                    console.warn(`[${task}] ${modelId} busy on key #${keyIndex + 1}. Trying next key...`, errBody);
                    lastError = { status, data: errBody };
                    if (result.isCached && result.cacheState) {
                        result.cacheState.name = null;
                        result.cacheState.expiry = 0;
                    }
                } else if (status === 429) {
                    console.warn(`[429] Rate limit hit for ${modelId} on key #${keyIndex + 1}. Marking as rate limited for the rest of the day.`);
                    markKeyRateLimitedForModel(modelId, apiKey);
                    if (result.isCached && result.cacheState) {
                        result.cacheState.name = null;
                        result.cacheState.expiry = 0;
                    }
                } else {
                    // Other non-busy, non-429 error (e.g. 4xx bad request or unavailable model)
                    console.warn(`[${task}] ${modelId} failed on key #${keyIndex + 1} with status ${status}. Trying next key...`, errBody);
                    lastError = { status, data: errBody };
                    if (result.isCached && result.cacheState) {
                        result.cacheState.name = null;
                        result.cacheState.expiry = 0;
                    }
                }

                keyIndex++;
            }
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