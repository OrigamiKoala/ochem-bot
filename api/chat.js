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
- Create highly original questions requiring first-principles reasoning over memory or template-matching.
- Questions should reward chemical intuition, not breadth of knowledge, experience grinding previous problems, or computational power.
- Center every problem on a non-obvious conceptual trick, hidden limiting factor, or subtle breakdown of a standard assumption.
- Keep question text neutral and objective — no hints, warnings, or clarifying instructions.
- Incorporate a deceptive path: the most common rote formula shortcut should yield a value matching one incorrect distractor.

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
(No examples provided for organic chemistry generation. Focus strictly on correct JSON struc###Steps:###
To ensure high question quality while streaming incrementally:
- Place your thought process for each question inside the "thoughtProcess" JSON field of that question object.
- **For the first question object in the array**: Start the "thoughtProcess" value with your "Overall Plan" (deciding the topics, difficulties, and traps for all questions to get an overall sense for the test), followed by the sequential steps for the first question.
- **For each question object sequentially**: Inside its "thoughtProcess" field, perform the draft, test-solving, feedback, and revision steps. Keep these explanations extremely concise (e.g. 1 short sentence per step) to minimize generation latency.

For example, your thought process might look like:

Step 1: The user wants me to generate 5 chemistry olympiad questions with difficulty 50.

Step 2, 3: For the first question, I will test stoichiometry (identifying an unknown compound based on resulting gases), with difficulty level 5. For the second question, I will test electrochemistry (overpotential), with difficulty level 6.

Step 4: Now I will generate the problem texts.

1. A compound M reacts in the following reaction. $\ce{M + 5 O_2 -> 3 C O_2 + 4 H_2 O}. How many grams of $\ce{M}$ are required to form $14.4$ liters of $\ce{C O_2}$ at STP? The trap is to forget to balance out the chemical equation.

2. A reaction has a standard exchange current density ($j_0$) of $1.0$ A/cm$^2$ at $25$ °C. What is the current density ($j$) when the overpotential ($\eta$) is $0.1$ V? The trap is to forget to multiply the exchange current density by 2 when taking the absolute value.

Step 5: Test-solve and feedback

Question 1 Test-Solve:
Equation given: M + 5 O2 -> 3 CO2 + 4 H2O.
Equation is balanced; M = C3H8 (molar mass = 44.1 g/mol).
Moles of CO2 = 14.4 L / 22.4 L/mol = 0.643 mol.
Moles of M = 0.643 / 3 = 0.214 mol.
Mass of M = 0.214 mol * 44.1 g/mol = 9.44 g.
Question 1 Feedback: Problem is too easy and too standard for difficulty level 5. Make it more challenging by removing the equation and giving how much of each gas is produced when a given amount of M is burned.

Question 2 Test-Solve:
Using Butler-Volmer equation: j = j0 * (exp(alpha_a * n * F * eta / RT) - exp(-alpha_c * n * F * eta / RT)).
Parameters n and alpha are missing.
Question 2 Feedback: Butler-Volmer equation is beyond the scope of the USNCO, and beyond difficulty level 6. Replace the entire question.

Step 6: Improve the questions

Question 1 Revision: A 4.41 g sample of a gaseous hydrocarbon M is completely combusted in excess oxygen to produce 13.20 g of CO2 and 7.21 g of H2O. Determine the molecular formula of M if its density at STP is 1.97 g/L.
Question 2 Revision: A galvanic cell consists of a silver electrode in 1.0 M AgNO3 and a copper electrode in 1.0 M Cu(NO3)2. If the cell operates at 25 degrees C under a constant current of 2.0 A for 45 minutes, calculate the change in mass of the copper electrode. (E0 Ag+/Ag = +0.80 V, E0 Cu2+/Cu = +0.34 V, F = 96485 C/mol).

Step 7: Solve and verify uniqueness

Question 1 Solution:
Moles C = 13.20 g / 44.01 g/mol = 0.300 mol.
Moles H = 2 * (7.21 g / 18.02 g/mol) = 0.800 mol.
Empirical formula = C3H8.
Molar mass = 1.97 g/L * 22.4 L/mol = 44.1 g/mol.
Molecular formula = C3H8.
Uniqueness: Single hydrocarbon identity fits elemental mass ratios and molar mass.

Question 2 Solution:
Anode reaction: Cu -> Cu2+ + 2e-.
Charge Q = 2.0 A * 45 min * 60 s/min = 5400 C.
Moles e- = 5400 C / 96485 C/mol = 0.0560 mol.
Moles Cu = 0.0560 mol / 2 = 0.0280 mol.
Mass decrease = 0.0280 mol * 63.55 g/mol = 1.78 g.
Uniqueness: Standard reduction potentials confirm copper is the anode. Faraday's law yields one precise value.

Step 8: Double check constraints

Target difficulties (5 and 6) met. Traps appropriate for USNCO. Formatting constraints followed. No bold text used.

Final Output JSON:
{
  "reactions": [
    {
      "thoughtProcess": "Overall Plan: Q1 stoichiometry (difficulty 5, balance trap), Q2 electrochemistry cell change (difficulty 6). Q1 Draft: M + 5 O2 -> 3 CO2... Q1 Test-solve: Moles CO2 = 14.4 / 22.4 = 0.643 mol... Q1 Feedback: Too easy. Q1 Revise: hydrocarbon combustion masses. Q1 Solve: Empirical = C3H8, Molar mass = 44.1. Formula C3H8.",
      "qtype": "calculate",
      "reactants": "",
      "reagents": "",
      "conditions": "",
      "answer": "C3H8",
      "instructions": "A $4.41\\\\text{ g}$ sample of a gaseous hydrocarbon M is completely combusted in excess oxygen to produce $13.20\\\\text{ g}$ of $\\\\ce{CO2}$ and $7.21\\\\text{ g}$ of $\\\\ce{H2O}$. Determine the molecular formula of M if its density at STP is $1.97\\\\text{ g L}^{-1}$.",
      "hint": "Determine the empirical formula from the masses of carbon dioxide and water, then use the density at STP to find the molar mass.",
      "explanation": "Calculate the moles of carbon and hydrogen atoms from the combustion products:\\\\n- Moles of $\\\\text{C} = 13.20\\\\text{ g} / 44.01\\\\text{ g mol}^{-1} = 0.300\\\\text{ mol}$\\\\n- Moles of $\\\\text{H} = 2 \\\\times (7.21\\\\text{ g} / 18.02\\\\text{ g mol}^{-1}) = 0.800\\\\text{ mol}$\\\\n\\\\nThe empirical formula is $\\\\ce{C3H8}$ (empirical formula mass $= 44.1\\\\text{ g mol}^{-1}$).\\\\n\\\\nNext, use the density at STP to calculate the molar mass of M:\\\\n- $\\\\text{Molar Mass} = 1.97\\\\text{ g L}^{-1} \\\\times 22.4\\\\text{ L mol}^{-1} = 44.1\\\\text{ g mol}^{-1}$\\\\n\\\\nSince the molar mass matches the empirical formula mass, the molecular formula of M is $\\\\ce{C3H8}$."
    },
    {
      "thoughtProcess": "Q2 Draft: Butler-Volmer overpotential. Q2 Test-solve: Butler-Volmer is too advanced for USNCO. Q2 Feedback: Replace with standard galvanic cell. Q2 Revise: Silver/copper cell mass change. Q2 Solve: Cu -> Cu2+ + 2e-. Q = 5400 C. Moles e- = 0.0560. Moles Cu = 0.0280. Mass change = 1.78 g decrease.",
      "qtype": "calculate",
      "reactants": "",
      "reagents": "",
      "conditions": "",
      "answer": "1.78 g decrease",
      "instructions": "A galvanic cell consists of a silver electrode in $1.0\\\\text{ M } \\\\ce{AgNO3}$ and a copper electrode in $1.0\\\\text{ M } \\\\ce{Cu(NO3)2}$. If the cell operates at $25\\\\ ^{\\\\circ}\\\\text{C}$ under a constant current of $2.0\\\\text{ A}$ for $45$ minutes, calculate the change in mass of the copper electrode. ($E^{\\\\circ}(\\\\ce{Ag^+/Ag}) = +0.80\\\\text{ V}$, $E^{\\\\circ}(\\\\ce{Cu^{2+}/Cu}) = +0.34\\\\text{ V}$, $F = 96485\\\\text{ C mol}^{-1}$)",
      "hint": "Compare the standard reduction potentials to determine which electrode acts as the anode, then apply Faraday's law of electrolysis.",
      "explanation": "Since $E^{\\\\circ}(\\\\ce{Ag^+/Ag}) = +0.80\\\\text{ V}$ is greater than $E^{\\\\circ}(\\\\ce{Cu^{2+}/Cu}) = +0.34\\\\text{ V}$, silver ions are reduced at the cathode, and the copper electrode undergoes oxidation at the anode:\\\\n$$\\\\ce{Cu(s) -> Cu^{2+}(aq) + 2e^-}$$\\\\n\\\\nThis oxidation causes a decrease in the mass of the copper electrode. First, calculate the total charge $Q$ passed through the cell:\\\\n- $Q = I \\\\times t = 2.0\\\\text{ A} \\\\times (45\\\\text{ min} \\\\times 60\\\\text{ s min}^{-1}) = 5400\\\\text{ C}$\\\\n\\\\nConvert charge to moles of electrons:\\\\n- $n(\\\\text{e}^-) = 5400\\\\text{ C} / 96485\\\\text{ C mol}^{-1} = 0.0560\\\\text{ mol}$\\\\n\\\\nFrom the stoichiometry of the anode reaction, 1 mole of copper is oxidized for every 2 moles of electrons:\\\\n- $n(\\\\ce{Cu}) = 0.0560\\\\text{ mol} / 2 = 0.0280\\\\text{ mol}$\\\\n\\\\nCalculate the mass loss of the copper electrode:\\\\n- $\\\\Delta m = 0.0280\\\\text{ mol} \\\\times 63.55\\\\text{ g mol}^{-1} = 1.78\\\\text{ g}$ decrease."
    }
  ]
}


###Output Requirements:###
Output JSON only with the following schema:
{"reactions":[{"thoughtProcess":"Thought process string detailing the plan/verifications (extremely concise)","qtype":"predict|mechanism|stereo","reactants":"SMILES","reagents":"organic in [[SMILES: ...]], inorganic as LaTeX (wrapped in inline math delimiters $...$)","conditions":"plain text","answer":"SMILES","instructions":"task","hint":"a brief helpful hint that nudges the student toward the right approach while helping them discover the solution on their own — e.g. mention a key reagent role, or highlight a functional group to focus on","explanation":"detailed mechanism with [[SMILES: ...]] for intermediates"}]}
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
Problem: Too simple — single formula plug-in. Questions must require multi-###Steps:###
To ensure high question quality while streaming incrementally:
- Place your thought process for each question inside the "thoughtProcess" JSON field of that question object.
- **For the first question object in the array**: Start the "thoughtProcess" value with your "Overall Plan" (deciding the topics, difficulties, and traps for all questions to get an overall sense for the test), followed by the sequential steps for the first question.
- **For each question object sequentially**: Inside its "thoughtProcess" field, perform the draft, test-solving, feedback, and revision steps. Keep these explanations extremely concise (e.g. 1 short sentence per step) to minimize generation latency.

For example, your thought process might look like:

Step 1: The user wants me to generate 5 chemistry olympiad questions with difficulty 50.

Step 2, 3: For the first question, I will test stoichiometry (identifying an unknown compound based on resulting gases), with difficulty level 5. For the second question, I will test electrochemistry (overpotential), with difficulty level 6.

Step 4: Now I will generate the problem texts.

1. A compound M reacts in the following reaction. $\ce{M + 5 O_2 -> 3 C O_2 + 4 H_2 O}. How many grams of $\ce{M}$ are required to form $14.4$ liters of $\ce{C O_2}$ at STP? The trap is to forget to balance out the chemical equation.

2. A reaction has a standard exchange current density ($j_0$) of $1.0$ A/cm$^2$ at $25$ °C. What is the current density ($j$) when the overpotential ($\eta$) is $0.1$ V? The trap is to forget to multiply the exchange current density by 2 when taking the absolute value.

Step 5: Test-solve and feedback

Question 1 Test-Solve:
Equation given: M + 5 O2 -> 3 CO2 + 4 H2O.
Equation is balanced; M = C3H8 (molar mass = 44.1 g/mol).
Moles of CO2 = 14.4 L / 22.4 L/mol = 0.643 mol.
Moles of M = 0.643 / 3 = 0.214 mol.
Mass of M = 0.214 mol * 44.1 g/mol = 9.44 g.
Question 1 Feedback: Problem is too easy and too standard for difficulty level 5. Make it more challenging by removing the equation and giving how much of each gas is produced when a given amount of M is burned.

Question 2 Test-Solve:
Using Butler-Volmer equation: j = j0 * (exp(alpha_a * n * F * eta / RT) - exp(-alpha_c * n * F * eta / RT)).
Parameters n and alpha are missing.
Question 2 Feedback: Butler-Volmer equation is beyond the scope of the USNCO, and beyond difficulty level 6. Replace the entire question.

Step 6: Improve the questions

Question 1 Revision: A 4.41 g sample of a gaseous hydrocarbon M is completely combusted in excess oxygen to produce 13.20 g of CO2 and 7.21 g of H2O. Determine the molecular formula of M if its density at STP is 1.97 g/L.
Question 2 Revision: A galvanic cell consists of a silver electrode in 1.0 M AgNO3 and a copper electrode in 1.0 M Cu(NO3)2. If the cell operates at 25 degrees C under a constant current of 2.0 A for 45 minutes, calculate the change in mass of the copper electrode. (E0 Ag+/Ag = +0.80 V, E0 Cu2+/Cu = +0.34 V, F = 96485 C/mol).

Step 7: Solve and verify uniqueness

Question 1 Solution:
Moles C = 13.20 g / 44.01 g/mol = 0.300 mol.
Moles H = 2 * (7.21 g / 18.02 g/mol) = 0.800 mol.
Empirical formula = C3H8.
Molar mass = 1.97 g/L * 22.4 L/mol = 44.1 g/mol.
Molecular formula = C3H8.
Uniqueness: Single hydrocarbon identity fits elemental mass ratios and molar mass.

Question 2 Solution:
Anode reaction: Cu -> Cu2+ + 2e-.
Charge Q = 2.0 A * 45 min * 60 s/min = 5400 C.
Moles e- = 5400 C / 96485 C/mol = 0.0560 mol.
Moles Cu = 0.0560 mol / 2 = 0.0280 mol.
Mass decrease = 0.0280 mol * 63.55 g/mol = 1.78 g.
Uniqueness: Standard reduction potentials confirm copper is the anode. Faraday's law yields one precise value.

Step 8: Double check constraints

Target difficulties (5 and 6) met. Traps appropriate for USNCO. Formatting constraints followed. No bold text used.

Final Output JSON:
{
  "reactions": [
    {
      "thoughtProcess": "Overall Plan: Q1 stoichiometry (difficulty 5, balance trap), Q2 electrochemistry cell change (difficulty 6). Q1 Draft: M + 5 O2 -> 3 CO2... Q1 Test-solve: Moles CO2 = 14.4 / 22.4 = 0.643 mol... Q1 Feedback: Too easy. Q1 Revise: hydrocarbon combustion masses. Q1 Solve: Empirical = C3H8, Molar mass = 44.1. Formula C3H8.",
      "qtype": "calculate",
      "reactants": "",
      "reagents": "",
      "conditions": "",
      "answer": "C3H8",
      "instructions": "A $4.41\\\\text{ g}$ sample of a gaseous hydrocarbon M is completely combusted in excess oxygen to produce $13.20\\\\text{ g}$ of $\\\\ce{CO2}$ and $7.21\\\\text{ g}$ of $\\\\ce{H2O}$. Determine the molecular formula of M if its density at STP is $1.97\\\\text{ g L}^{-1}$.",
      "hint": "Determine the empirical formula from the masses of carbon dioxide and water, then use the density at STP to find the molar mass.",
      "explanation": "Calculate the moles of carbon and hydrogen atoms from the combustion products:\\\\n- Moles of $\\\\text{C} = 13.20\\\\text{ g} / 44.01\\\\text{ g mol}^{-1} = 0.300\\\\text{ mol}$\\\\n- Moles of $\\\\text{H} = 2 \\\\times (7.21\\\\text{ g} / 18.02\\\\text{ g mol}^{-1}) = 0.800\\\\text{ mol}$\\\\n\\\\nThe empirical formula is $\\\\ce{C3H8}$ (empirical formula mass $= 44.1\\\\text{ g mol}^{-1}$).\\\\n\\\\nNext, use the density at STP to calculate the molar mass of M:\\\\n- $\\\\text{Molar Mass} = 1.97\\\\text{ g L}^{-1} \\\\times 22.4\\\\text{ L mol}^{-1} = 44.1\\\\text{ g mol}^{-1}$\\\\n\\\\nSince the molar mass matches the empirical formula mass, the molecular formula of M is $\\\\ce{C3H8}$."
    },
    {
      "thoughtProcess": "Q2 Draft: Butler-Volmer overpotential. Q2 Test-solve: Butler-Volmer is too advanced for USNCO. Q2 Feedback: Replace with standard galvanic cell. Q2 Revise: Silver/copper cell mass change. Q2 Solve: Cu -> Cu2+ + 2e-. Q = 5400 C. Moles e- = 0.0560. Moles Cu = 0.0280. Mass change = 1.78 g decrease.",
      "qtype": "calculate",
      "reactants": "",
      "reagents": "",
      "conditions": "",
      "answer": "1.78 g decrease",
      "instructions": "A galvanic cell consists of a silver electrode in $1.0\\\\text{ M } \\\\ce{AgNO3}$ and a copper electrode in $1.0\\\\text{ M } \\\\ce{Cu(NO3)2}$. If the cell operates at $25\\\\ ^{\\\\circ}\\\\text{C}$ under a constant current of $2.0\\\\text{ A}$ for $45$ minutes, calculate the change in mass of the copper electrode. ($E^{\\\\circ}(\\\\ce{Ag^+/Ag}) = +0.80\\\\text{ V}$, $E^{\\\\circ}(\\\\ce{Cu^{2+}/Cu}) = +0.34\\\\text{ V}$, $F = 96485\\\\text{ C mol}^{-1}$)",
      "hint": "Compare the standard reduction potentials to determine which electrode acts as the anode, then apply Faraday's law of electrolysis.",
      "explanation": "Since $E^{\\\\circ}(\\\\ce{Ag^+/Ag}) = +0.80\\\\text{ V}$ is greater than $E^{\\\\circ}(\\\\ce{Cu^{2+}/Cu}) = +0.34\\\\text{ V}$, silver ions are reduced at the cathode, and the copper electrode undergoes oxidation at the anode:\\\\n$$\\\\ce{Cu(s) -> Cu^{2+}(aq) + 2e^-}$$\\\\n\\\\nThis oxidation causes a decrease in the mass of the copper electrode. First, calculate the total charge $Q$ passed through the cell:\\\\n- $Q = I \\\\times t = 2.0\\\\text{ A} \\\\times (45\\\\text{ min} \\\\times 60\\\\text{ s min}^{-1}) = 5400\\\\text{ C}$\\\\n\\\\nConvert charge to moles of electrons:\\\\n- $n(\\\\text{e}^-) = 5400\\\\text{ C} / 96485\\\\text{ C mol}^{-1} = 0.0560\\\\text{ mol}$\\\\n\\\\nFrom the stoichiometry of the anode reaction, 1 mole of copper is oxidized for every 2 moles of electrons:\\\\n- $n(\\\\ce{Cu}) = 0.0560\\\\text{ mol} / 2 = 0.0280\\\\text{ mol}$\\\\n\\\\nCalculate the mass loss of the copper electrode:\\\\n- $\\\\Delta m = 0.0280\\\\text{ mol} \\\\times 63.55\\\\text{ g mol}^{-1} = 1.78\\\\text{ g}$ decrease."
    }
  ]
}

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

    const startIndex = Math.floor(Math.random() * keys.length);
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