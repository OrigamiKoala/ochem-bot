// api/chat.js

// --- Explicit Context Caching for Generation (prompts large enough to cache) ---
let generationCacheState = { name: null, expiry: 0 };

// --- Gen-Chem mode cache (separate from ochem) ---
let genchemGenerationCacheState = { name: null, expiry: 0 };

// Grading prompts are too short for Gemini's context cache minimum token count,
// so grading always uses the non-cached path with the system instruction inlined.

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

const GENERATION_SYSTEM_INSTRUCTION = `###Role:### You are an expert organic chemistry problem generator and examiner creating questions for high-stakes competitive olympiad exams.

###Goal:### Generate challenging, concept-rich organic chemistry problems that demand first-principles reasoning instead of template-matching.

###Constraints:###
Follow these strict Olympiad Design Philosophies:

1. Novelty & "Invisible Traps" (Subtle Conceptual Bottlenecks)
- Focus on creating original, conceptually rich questions that demand first-principles reasoning instead of template-matching.
- Every problem must center on a non-obvious conceptual trick, a hidden limiting factor, or a subtle breakdown of a standard textbook assumption.
- Keep the question text entirely neutral. Present all necessary context and parameters clearly and let the student deduce the correct constraints on their own.

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
- Conceptual Integration (Multi-Topic Coupling): Standard questions isolate a single topic. High-quality difficult questions require the simultaneous application of disparate chemical principles.
- Multi-Step Logical Cascades: The problem cannot be solved in a single step. It requires a clear execution pathway where the output of one step forms the input of the next.
- Discrimination of Subtle Chemical Nuances: Distinguishes top-tier students by testing exceptions grounded in fundamental principles (e.g. thermodynamic vs. kinetic control).
- Novel Context and Data Interpretation: Presents familiar chemical principles within an unfamiliar framework.

4. Organic Reaction Rules:
- Reactions MUST actually occur. Verify against Clayden/Wade/McMurry.
- Symbols: {DELTA}=heat, {deg}=°, {hv}=hν, {H2}=H₂, {H+}=H⁺
- Write solvents and reagents in plain text (e.g. EtOH, THF, H2O) instead of utilizing LaTeX \\text{}.
- [[SMILES: ...]] for organic compounds and LaTeX for inorganic compounds/ions (which MUST be wrapped in inline math delimiters $...$, e.g. $\\ce{H2SO4}$).
- Product must be MAJOR product. SMILES must be valid and balanced.

###Examples:###
(No examples provided for organic chemistry generation. Focus strictly on correct JSON structure.)

###Steps:###
1. Brainstorm an organic reaction or mechanism concept.
2. Formulate the starting materials, reagents, and conditions.
3. Identify the major organic product and its correct SMILES.
4. Draft a neutral instruction, hint, and detailed explanation of the mechanism.
5. Format the output strictly matching the required JSON schema.

###Output Requirements:###
Output JSON only with the following schema:
{"reactions":[{"qtype":"predict|mechanism|stereo","reactants":"SMILES","reagents":"organic in [[SMILES: ...]], inorganic as LaTeX (wrapped in inline math delimiters $...$)","conditions":"plain text","answer":"SMILES","instructions":"task","hint":"a brief helpful hint that nudges the student toward the right approach while helping them discover the solution on their own — e.g. mention a key reagent role, or highlight a functional group to focus on","explanation":"detailed mechanism with [[SMILES: ...]] for intermediates"}]}
` + CHALLENGE_PHILOSOPHY;

const GENCHEM_GENERATION_SYSTEM_INSTRUCTION = `###Role:### You are an expert chemistry professor generating olympiad problems (USNCO/IChO) for high-stakes exams.

###Goal:### Generate challenging general chemistry problems covering all topics broadly, including inorganic, physical, analytical, and organic chemistry.

###Constraints:###
Follow these strict Olympiad Design Philosophies:

1. Novelty \u0026 "Invisible Traps" (Subtle Conceptual Bottlenecks)
- Create highly original questions requiring first-principles reasoning over memory or template-matching.
- Center every problem on a non-obvious conceptual trick, hidden limiting factor, or subtle breakdown of a standard assumption.
- Keep question text neutral and objective — no hints, warnings, or clarifying instructions.
- Incorporate a deceptive path: the most common rote formula shortcut should yield a value matching one incorrect distractor.

2. Advanced Design \u0026 Difficulty Criteria
- Multi-Topic Coupling: Require simultaneous application of disparate chemical principles (e.g., coupling $K_f$ with $K_{sp}$ and $E^{\\\\circ}$).
- Multi-Step Logical Cascades: Output of one step forms input of the next, without explicit prompting on intermediate variables.
- Subtle Chemical Nuances: Test exceptions grounded in fundamental principles — thermodynamic vs. kinetic control, anomalous MO configurations, etc.
- Mathematical Rigor: Eliminate simplifying assumptions (e.g., $x$-is-small). Require higher-order equations from mass/charge balances.
- Novel Context: Present familiar principles in unfamiliar frameworks (bioinorganic, industrial catalysis, MOFs). Extract variables from raw data/graphs.

3. Difficulty-Dependent Syllabus Boundaries
- IF DIFFICULTY = USNCO National Level (40-75):
  - Maintain USNCO scope but test to maximum depth.
  - Limit to AP/USNCO curricula, non-calculus math, standard 1D-NMR/IR/UV-Vis.
  - Exclude Tafel equation, advanced quantum mechanics, etc.
  - Increase difficulty by coupling unexpected systems.
- IF DIFFICULTY = IChO Level (75-100):
  - Pivot to original, concept-first designs with advanced phenomena.
  - First-Principles Guardrail: Introduce extra-syllabus topics with self-contained axiomatic background in the problem preamble.

4. Structural Representation (SMILES Rules)
- Simple formulas in standard prose/LaTeX (e.g., $\\\\text{H}_2\\\\text{O}$).
- [[SMILES: ...]] only for complex organic molecules or coordination complexes.
- LaTeX for all math equations, equilibrium expressions, units, variables.

5. SVG Graphics \u0026 Diagrams
- When needed, generate a single self-contained valid <svg> block wrapped in [[SVG: <svg>...</svg>]].
- Use primitive shapes, <defs>/<use> for reuse, minimal path control points.
- Use inline presentation attributes (no CSS <style> blocks). Include white background rect.
- Use single-quotes for SVG attributes for JSON compatibility.

###FEW-SHOT EXAMPLES:

USNCO Example (multiple_choice):
{
  "qtype": "multiple_choice",
  "reactants": "",
  "reagents": "",
  "conditions": "",
  "answer": "B",
  "instructions": "Which species has the longest carbon-oxygen bond?\\\\n\\\\nA. $\\\\ce{HCO2^-}$\\\\nB. $\\\\ce{CO3^{2-}}$\\\\nC. $\\\\ce{CO2}$\\\\nD. $\\\\ce{COS}$",
  "hint": "Determine the average bond order for the C-O bonds in each species using resonance structures.",
  "explanation": "Bond length is inversely proportional to bond order. $\\\\ce{HCO2^-}$: BO = 1.5. $\\\\ce{CO3^{2-}}$: BO = 1.33. $\\\\ce{CO2}$: BO = 2.0. $\\\\ce{COS}$: BO = 2.0. Carbonate has the lowest BO (1.33) and therefore the longest C-O bond. Answer: (B)."
}

USNCO Example (free_response with SMILES):
{
  "qtype": "multiple_choice",
  "reactants": "",
  "reagents": "",
  "conditions": "",
  "answer": "D",
  "instructions": "Which is the best description of the arrangement of the atoms in space in the protonated urea ion, $\\\\ce{H5CN2O^+}$?\\\\n\\\\nA. [[SMILES: NC(=O)[NH3+]]]\\\\nB. [[SMILES: NC(=O)[NH3+]]]\\\\nC. [[SMILES: N=C(O)N]]\\\\nD. [[SMILES: NC(O)=[NH2+]]]",
  "hint": "Consider which site of protonation in urea (oxygen vs. nitrogen) allows for resonance stabilization of the positive charge.",
  "explanation": "Protonation of urea occurs preferentially on oxygen (not nitrogen), because the resulting cation $\\\\ce{[(NH2)2C=OH]^+}$ is stabilized by resonance delocalization of the positive charge over both nitrogen atoms. The SMILES [[SMILES: NC(O)=[NH2+]]] represents the O-protonated form, option (D)."
}

IChO Example (free_response):
{
  "qtype": "free_response",
  "reactants": "",
  "reagents": "",
  "conditions": "",
  "answer": "",
  "instructions": "Fluoride ions form a stable complex with aluminum(III): $\\\\ce{6F^- + Al^{3+} <=> [AlF6]^{3-}}$\\\\n\\\\nA fluoride sample was neutralized, saturated with $\\\\ce{NaCl}$, heated to $70-80\\\\ ^\\\\circ\\\\text{C}$, and titrated with $0.150\\\\text{ M } \\\\ce{AlCl3}$ until methyl red turned pink.\\\\n\\\\na. Write the equation at the endpoint and explain the role of $\\\\ce{NaCl}$.\\\\nb. Explain why heating increases endpoint sharpness.\\\\nc. In a back-titration, $0.500\\\\text{ g } \\\\ce{NaF}$ and excess $\\\\ce{NaCl}$ were added to a calcium sample. Titration with $0.1000\\\\text{ M } \\\\ce{AlCl3}$ required $10.25\\\\text{ cm}^3$. Calculate moles and mass of calcium.",
  "hint": "Focus on Al(III) hydrolysis at the endpoint. For quantitative parts, set up stoichiometric mole balances.",
  "explanation": "a. Excess $\\\\ce{Al^{3+}}$ hydrolyzes: $\\\\ce{[Al(H2O)6]^{3+} + H2O <=> [Al(OH)(H2O)5]^{2+} + H3O^+}$. $\\\\ce{NaCl}$ precipitates cryolite ($\\\\ce{Na3AlF6}$), driving complexation forward.\\\\nb. Al(III) hydrolysis is endothermic; heating produces more $\\\\ce{H3O^+}$ per excess $\\\\ce{Al^{3+}}$.\\\\nc. $n(\\\\ce{F^-}) = 0.500/41.99 = 0.01191$ mol. $n(\\\\ce{Al^{3+}}) = 0.001025$ mol. $n(\\\\ce{F^-})_{complexed} = 0.006150$ mol. $n(\\\\ce{F^-})_{ppt} = 0.00576$ mol. $n(\\\\ce{Ca^{2+}}) = 0.00288$ mol. $m = 0.115$ g."
}

Bad example (DO NOT generate questions like this):
{
  "topic": "Stoichiometry",
  "question": "Calculate the number of moles of NaCl in 5.0 grams. (M = 58.44 g/mol)",
  "answer": "A",
  "difficulty": 1
}
Problem: Too simple — single formula plug-in. Questions must require multi-step reasoning.

RULES:
- Chemistry MUST be correct. Double-check calculations and products.
- For inorganic compounds/ions, use LaTeX (e.g. $\\\\ce{H2SO4}$, $\\\\ce{MnO4^-}$) wrapped in $...$ instead of SMILES.
- ALWAYS wrap ALL LaTeX formulas, chemical equations, units in $...$ or $$...$$.
- Reserve [[SMILES: ...]] for organic compounds with 3+ carbons. Write fully valid SMILES.
- For graphs/plots, generate SVG wrapped in [[SVG: <svg>...</svg>]]. Use primitive shapes, minimal paths, inline attributes, white background.
- Show all calculation steps in explanation with correct units and sig figs.
- VISUAL DIAGRAMS: For visual questions, embed LaTeX in 'instructions'. Use arrays/matrices for tables.

All questions generated MUST adhere to these critical design directives:
1. QUESTION STYLE: Difficulty 10-40 = standard/straightforward. Difficulty 50-100 = tricky conceptual traps OR standard but highly challenging.
2. BALANCED TOPIC DIVERSITY: Distribute questions evenly across core chemistry topics.
3. DETAILED SOLUTIONS: Every question MUST include a thorough step-by-step solution in the "explanation" field.
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

const CACHE_FAIL_COOLDOWN_MS = 300000; // 5 min cooldown after cache creation failure

async function ensureCache(label, modelId, apiKey, systemText, state) {
    const now = Date.now();
    if (state.name && now < state.expiry - 60000) return state.name;

    // Skip if cache creation recently failed (avoids wasted API call)
    if (state.failedUntil && now < state.failedUntil) return null;

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

    if (!cacheResponse.ok) {
        state.failedUntil = now + CACHE_FAIL_COOLDOWN_MS;
        return null;
    }

    const cacheData = await cacheResponse.json();
    state.name = cacheData.name;
    state.expiry = now + CACHE_TTL_SECONDS * 1000;
    state.failedUntil = 0;
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
    const GRADING_MODELS = ["gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-3-flash-preview", "gemini-2.5-flash"];
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
                // No caching for grading — prompts too short for Gemini's cache minimum.
                // System instruction is inlined in the non-cached path via cacheSystemText.
                if (isFreeDraw) {
                    cacheSystemText = (gradeMode === 'learn') ? FREEDRAW_GRADING_LEARN_SYSTEM_INSTRUCTION : FREEDRAW_GRADING_NORMAL_SYSTEM_INSTRUCTION;
                } else if (isGenChem) {
                    cacheSystemText = (gradeMode === 'learn') ? GENCHEM_GRADING_LEARN_SYSTEM_INSTRUCTION : GENCHEM_GRADING_NORMAL_SYSTEM_INSTRUCTION;
                } else {
                    cacheSystemText = (gradeMode === 'learn') ? GRADING_LEARN_SYSTEM_INSTRUCTION : GRADING_NORMAL_SYSTEM_INSTRUCTION;
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
                        result.cacheState.failedUntil = Date.now() + CACHE_FAIL_COOLDOWN_MS;
                    }
                } else if (status === 429) {
                    console.warn(`[429] Rate limit hit for ${modelId} on key #${keyIndex + 1}. Marking as rate limited for the rest of the day.`);
                    markKeyRateLimitedForModel(modelId, apiKey);
                    if (result.isCached && result.cacheState) {
                        result.cacheState.name = null;
                        result.cacheState.expiry = 0;
                        result.cacheState.failedUntil = Date.now() + CACHE_FAIL_COOLDOWN_MS;
                    }
                } else {
                    // Other non-busy, non-429 error (e.g. 4xx bad request or unavailable model)
                    console.warn(`[${task}] ${modelId} failed on key #${keyIndex + 1} with status ${status}. Trying next key...`, errBody);
                    lastError = { status, data: errBody };
                    if (result.isCached && result.cacheState) {
                        result.cacheState.name = null;
                        result.cacheState.expiry = 0;
                        result.cacheState.failedUntil = Date.now() + CACHE_FAIL_COOLDOWN_MS;
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