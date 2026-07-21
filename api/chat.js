// api/chat.js



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

const CHALLENGE_PHILOSOPHY = `
1. Novelty & "Invisible Traps" (Subtle Conceptual Bottlenecks)
- Create highly original questions requiring first-principles reasoning over memory or template-matching.
- Questions should reward chemical intuition, not breadth of knowledge, experience grinding previous problems, or computational power.
- Center every problem on a non-obvious conceptual trick, hidden limiting factor, or subtle breakdown of a standard assumption.
- Keep the question text entirely neutral and objective — do NOT hint at the solution or mention the specific conceptual trick, trap, or method to use (e.g. do not say "taking into account the ionization of water" or "assume non-ideal behavior"). For example, instead of: "Calculate the pH of a $1.00 \times 10^{-8}$ M aqueous solution of $\ce{HCl}$ at $25 ^{\circ}$ C, taking into account the ionization of water", write: "Calculate the pH of a $1.00 \times 10^{-8}$ M aqueous solution of $\ce{HCl}$ at $25 ^{\circ}$ C".
- Incorporate a deceptive path: the most common rote formula shortcut should yield a value matching one incorrect distractor.

2. Difficulty-Dependent Syllabus Boundaries
- IF DIFFICULTY = USNCO National Level (40-75):
  - Stick strictly to standard AP/USNCO curricula, utilizing only foundational concepts. Try not to bring in too much outside knowledge - the outside knowledge as first principles/preamble approach should be reserved strictly for IChO questions. USNCO questions should use the standard high school olympiad knowledge base, but go very deep conceptually and mathematically. However, it is okay to bring in some outside knowledge to set up a more convoluted chemical system.
  - Do NOT test stereoselectivity or Tafel/Butler-Volmer equations (they are strictly reserved for IChO). Focus stereochemistry questions strictly on basic configurations.
  - Limit coordination chemistry questions to basic nomenclature, coordination number, and oxidation states.
  - Focus exclusively on algebra-based derivations and principles.
  - Limit spectroscopy to standard 1D-NMR, IR, and UV-Vis.
  - Increase difficulty by coupling unexpected systems (e.g., matching a non-trivial stoichiometry with an electrochemical change that alters concentration ratios, or an organic reaction where a common functional group exhibits atypical reactivity due to adjacent electronic effects).
- IF DIFFICULTY = IChO Level (75-100):
  - Pivot to completely original, concept-first designs leveraging advanced chemical phenomena.
  - The "First-Principles" Guardrail: Introduce advanced, extra-syllabus topics (bringing in outside knowledge, such as stereoselectivity or Tafel/Butler-Volmer equations) using self-contained, axiomatic background information within the problem preamble. A student must be able to deduce the correct path using standard prerequisites combined with the provided context.

3. Question Generation Criteria (For High-Difficulty Questions)
- Conceptual Integration (Multi-Topic Coupling): Standard questions isolate a single topic (e.g., a simple acid-base titration). High-quality difficult questions require the simultaneous application of disparate chemical principles. Example: Coupling a coordination chemistry equilibrium ($K_f$) with a solubility product ($K_{sp}$) and an electrochemical cell ($E^{\\circ}$), requiring the user to determine free ligand concentration via Nernst equation manipulation.
- Multi-Step Logical Cascades: The problem cannot be solved in a single algebraic or conceptual step. It requires a clear execution pathway where the output of one step forms the input of the next, often without explicit prompting on the intermediate variables. Example: Advanced organic synthesis/structure elucidation. Deducing a molecular structure from elemental analysis (empirical formula) $\\rightarrow$ mass spectrometry fragments $\\rightarrow$ IR functional groups $\\rightarrow$ regioselective multi-step mechanistic outcomes (e.g., ozonolysis followed by an intramolecular aldol condensation).
- Discrimination of Subtle Chemical Nuances: Distinguishes top-tier students by testing exceptions grounded in fundamental principles rather than rote memorization. Focuses on electronic structures, periodic trends, and thermodynamic vs. kinetic control. Example: Predicting the major product of an electrophilic aromatic substitution where steric hindrance and electronic activation conflict, or identifying anomalies in molecular orbital configurations (e.g., $B_2$ vs $O_2$ paramagnetism and bond orders).
- Mathematical and Algorithmic Rigor: Eliminates standard simplifying assumptions (e.g., the $x$-is-small approximation in weak acid ionization). Requires setting up and solving higher-order algebraic equations or systems of simultaneous equations derived from mass and charge balances. Example: Calculating the exact pH of a polyprotic acid solution where $K_{a2}$ is non-negligible or the solution is sufficiently dilute that water autoionization ($K_w$) must be factored into the charge balance equation:
$$\\text{[H}^+\\text{]} = \\text{[OH}^-\\text{]} + \\text{[A}^-\\text{]} + 2\\text{[A}^{2-}\\text{]}$$
- Novel Context and Data Interpretation: Present familiar principles in unfamiliar, real-world frameworks. MANDATORY — every question must be set in an unfamiliar or real-world olympiad-appropriate context. Rotate through this menu; do NOT use the same context type twice:
    • Industrial processes (Haber–Bosch, contact process, Hall–Héroult, Solvay, Fischer–Tropsch, Ostwald, organic synthesis scale-up)
    • Atmospheric chemistry (ozone depletion mechanisms, NOx photochemical smog, stratospheric halogen cycles)
    • Electroanalytical / separation science (cyclic voltammetry, ion-exchange chromatography, electrophoresis, potentiometry)
    • Nuclear & radiochemistry (radioactive decay series, specific activity, neutron activation analysis, isotopic labelling in synthesis)
    • Inorganic & organic materials (MOF gas adsorption, solid-state ion conductors, corrosion galvanic cells, crystal-field stabilization in spinels, conducting polymers)
    • Organic synthesis context (multi-step retrosynthesis, protecting-group strategy, regio- and stereoselectivity in complex substrates)
    • Thermochemical cycles (Born–Haber, Ellingham diagrams, coupled redox/precipitation equilibria)
    • Spectroscopic identification (mass-spec fragmentation cascades, 1H-NMR of chiral or aromatic systems, IR of coordinated ligands)

4. Backward Chaining (Reverse Design Methodology). EVERY single question generated must be completely unique, original, and never seen before.

***Constraints & Execution Instructions:***

1. **Backward Chaining Generation Methodology (CRITICAL - Ensure 100% Uniqueness & Originality)**
You must generate every question using a backward chaining thought process before outputting the final problem, ensuring that each question is completely unique, original, and never seen before:

* **Step 1 (The Trap - Must be completely unique and original):** Identify a specific, non-obvious conceptual trap, a hidden limiting factor, or a subtle breakdown of a standard textbook assumption. This trap must be entirely novel, original, and never seen before in any question or textbook.
* **Step 2 (The System - Must be completely unique and original):** Design a chemical system or reaction where this specific trap naturally occurs. The system, reaction, or scenario context must be completely unique, original, and never seen before (avoid standard textbook setups).
* **Step 3 (The Distractors - Must be completely unique and original):** Calculate or derive the incorrect answers that result directly from falling into the conceptual trap (rote formula shortcut, ignoring the limiting factor, etc.). Ensure the options are uniquely designed to target this specific trap.
* **Step 4 (The Problem - Must be completely unique and original):** Draft the neutral question text that presents the system, masking the trap completely, written in a completely unique, original, and never-seen-before style.

Here is an example:

***Step 1***: A common trap is, when investigating the reactivity of nitric acid, to only think of it as a strong protonating acid and failing to realize it is also a strong oxidizing agent.

***Step 2***: This system could be one where a metal (e.g. copper) is selectively reduced by a reducing agent (e.g. H2). The student might not realize the nitric acid competes for the electrons.

***Step 3***: If the student falls for this trap, they could be presented with the reducing agent (H2) and think only copper is reduced by it, when in reality nitric acid is also reduced by it. Perhaps the student thinks adding the reducing agent to react with the copper could determine the amount of copper in a solution, but not realize that excess weight will be added from the various nitrous oxides. 

***Step 4***: The student could be asked, “A weighed sample of a copper-nickel alloy is dissolved in a known volume of nitric acid. Which method is most suitable for determining the mass percent of copper in the alloy?” One of the options, consistent with the trap, should be “Bubbling hydrogen gas through the solution and measuring the mass of the metal that precipitates from the solution.” The other options could test other traps, i.e. that both nickel and copper form insoluble hydroxides, and that they both absorb the same wavelength of light. Thus the final question is: “A weighed sample of a copper-nickel alloy is dissolved in a known volume of nitric acid. Which method is most suitable for determining the mass percent of copper in the alloy?\\n\\n(A) Treatment of an aliquot of the solution with excess iodide, followed by titration of the iodine produced with sodium thiosulfate.\\n(B) Measurement of the absorbance of the solution at a wavelength of light at which both $\\\\ce{Cu^{2+}}$ and $\\\\ce{Ni^{2+}}$ absorb, and comparison with the absorbances of known standards of the two ions.\\n(C) Addition of excess sodium hydroxide to the solution, isolation of the metal hydroxides by filtration, and measurement of the mass of the precipitate.\\n(D) Bubbling hydrogen gas through the solution and measuring the mass of the metal that precipitates from the solution.”


ANTI-TEMPLATE DIRECTIVE: A problem is a forbidden template if it exhibits any of these structural properties — regardless of its topic or difficulty level:
- Single-formula plug-and-chug: one concept, one equation, values handed to the student, answer drops out directly with no coupling.
- Catalogue question: simply asks the student to recall or identify a memorised fact, rule, or definition with no reasoning step.
- Familiar scaffold with swapped numbers: structurally identical to a class of textbook problems (e.g., a standard titration, incline, or stoichiometry setup) with only numerical values or element names changed.
- Isolated calculation: tests exactly one sub-skill in complete isolation with no unexpected coupling to another concept.
- Generic framing: the question could have been written by any textbook author without any real-world or experimental motivation.
Any question matching one or more of these patterns must be redesigned before finalising.

SELF-CHECK (MANDATORY before finalising each question): Before writing the final JSON/response for each question, ask yourself: "Is this question structurally novel? Would a student who has drilled olympiad problem sets be genuinely surprised by the setup, the system, or the question being asked — even if they know the underlying concept well?" If the answer is no — if the setup is a familiar scaffold with new numbers or a different compound — redesign the question from scratch. What matters is whether the problem-setup itself is fresh and unexpected.

SURPRISING PREMISE DIRECTIVE: Every question should ideally open from a counterintuitive, puzzling, or surprising premise — a real experimental observation, an anomalous result, or a system that behaves differently from naive expectation. Avoid generic lab-exercise framings ("A student dissolves...", "A reaction occurs..."). Instead, ground the question in a specific, vivid scenario that demands explanation.

SVG DIAGRAMS (CRITICAL - HIGH FREQUENCY REQUIRED): You are STRONGLY ENCOURAGED to include SVG diagrams in a large proportion of your questions — aim for at least half of all questions to contain an SVG figure. Titration curves, phase diagrams, reaction coordinate plots, crystallographic unit cells, energy-level diagrams, or apparatus setups are excellent candidates. Embed the SVG directly in the question/instructions text using [[SVG: <svg ...>...</svg>]] markers. Use primitive shapes (<line>, <circle>, <rect>, <path>, <text>, <polygon>), inline attributes only (no CSS <style> blocks), white background, and single-quotes (') for all attribute values for JSON compatibility.

ANSWER-FORM VARIATION: Rotate the structural form of what the answer requires across questions. Do not produce multiple questions that all ask for the same type of quantity (e.g., all asking for a final numerical value, or all asking "which of the following is correct"). Include variety such as: a question whose answer is a ratio or dimensionless quantity derived from multiple steps; a question that requires identifying which piece of given information is irrelevant or insufficient; a question where the student must recognise that the naive calculation gives the wrong answer and explain why; a question whose answer is a qualitative ranking or ordering rather than a single value.

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
${CHALLENGE_PHILOSOPHY}

Oranic Reaction Rules:
- Reactions MUST actually occur. Verify against Clayden/Wade/McMurry.
- Symbols: {DELTA}=heat, {deg}=°, {hv}=hν, {H2}=H₂, {H+}=H⁺
- Write solvents and reagents in plain text (e.g. EtOH, THF, H2O) instead of utilizing LaTeX \\text{}.
- [[SMILES: ...]] for organic compounds and LaTeX for inorganic compounds/ions (which MUST be wrapped in inline math delimiters $...$, e.g. $\\ce{H2SO4}$).
- Product must be MAJOR product. SMILES must be valid and balanced.

###Examples:###
(No examples provided for organic chemistry generation. Focus strictly on correct JSON structure.)

###Output Requirements:###
Output JSON only with the following schema:
{"reactions":[{"qtype":"predict|mechanism|stereo","reactants":"SMILES","reagents":"organic in [[SMILES: ...]], inorganic as LaTeX (wrapped in inline math delimiters $...$)","conditions":"plain text","answer":"SMILES","instructions":"task","hint":"a brief helpful hint that nudges the student toward the right approach while helping them discover the solution on their own — e.g. mention a key reagent role, or highlight a functional group to focus on","explanation":"detailed mechanism with [[SMILES: ...]] for intermediates"}]}
`;

const GENCHEM_GENERATION_SYSTEM_INSTRUCTION = `###Role:### You are an expert chemistry professor generating olympiad problems (USNCO/IChO) for high-stakes exams.

###Goal:### Generate challenging general chemistry problems covering all topics broadly, including inorganic, physical, analytical, and organic chemistry.

###CRITICAL UNIQUE & CREATIVE DIRECTIVE:###
You must be extremely creative and ensure that EVERY question is completely unique and novel. Do NOT repeat, rephrase, or adapt previously used setups, standard textbook scenarios, chemical reactions, physical systems, or mathematical templates. Avoid using similar numerical values, scenarios, or phrasing across different questions or exams. Force yourself to design entirely new contexts, variables, and systems for each problem.

###Constraints:###

${CHALLENGE_PHILOSOPHY}

4. Structural Representation (SMILES Rules)
- Simple formulas or formulas for inorganic compounds in standard prose/LaTeX wrapped in $...$ (e.g., $\\\\text{H}_2\\\\text{O}$).
- Reserve [[SMILES: ...]] for organic compounds with 3+ carbons. Write fully valid SMILES.
- LaTeX for all math equations, equilibrium expressions, units, variables.

5. SVG Graphics \u0026 Diagrams
- When needed, generate a single self-contained valid <svg> block wrapped in [[SVG: <svg>...</svg>]].
- Use primitive shapes, <defs>/<use> for reuse, minimal path control points.
- Use inline presentation attributes (no CSS <style> blocks). Include white background rect.
- Use single-quotes for SVG attributes for JSON compatibility.
- Half the problems should have an SVG diagram required to solve the problem.

###FEW-SHOT EXAMPLES:

{{EXAMPLES}}

Bad example (DO NOT generate questions like this):
{
  "topic": "Stoichiometry",
  "question": "Calculate the number of moles of NaCl in 5.0 grams. (M = 58.44 g/mol)",
  "answer": "A",
  "difficulty": 1
}
Problem: Too simple — single formula plug-in. Questions must require multi-step reasoning.

###Output Requirements###
Output JSON only in the following schema:
    [
        {
            "qtype": "multiple_choice|free_response",
            "reactants": "",
            "reagents": "",
            "conditions": "",
            "answer": "answer here",
            "instructions": "question text here",
            "hint": "hint text here (do not give away the full answer)",
            "explanation": "detailed explanation here"
        }
    ]
`;

// --- Dynamic genchem exemplar rotation ---
const genchemExemplars = [
    {
        "id": "genchem_ex1",
        "qtype": "multiple_choice",
        "reactants": "",
        "reagents": "",
        "conditions": "",
        "answer": "B",
        "instructions": "Which species has the longest carbon-oxygen bond?\\\\n\\\\nA. $\\\\ce{HCO2^-}$\\\\nB. $\\\\ce{CO3^{2-}}$\\\\nC. $\\\\ce{CO2}$\\\\nD. $\\\\ce{COS}$",
        "hint": "Determine the average bond order for the C-O bonds in each species using resonance structures.",
        "explanation": "Bond length is inversely proportional to bond order. $\\\\ce{HCO2^-}$: BO = 1.5. $\\\\ce{CO3^{2-}}$: BO = 1.33. $\\\\ce{CO2}$: BO = 2.0. $\\\\ce{COS}$: BO = 2.0. Carbonate has the lowest BO (1.33) and therefore the longest C-O bond. Answer: (B)."
    },
    {
        "id": "genchem_ex2",
        "qtype": "multiple_choice",
        "reactants": "",
        "reagents": "",
        "conditions": "",
        "answer": "D",
        "instructions": "Which is the best description of the arrangement of the atoms in space in the protonated urea ion, $\\\\ce{H5CN2O^+}$?\\\\n\\\\nA. [[SMILES: NC(=O)[NH3+]]]\\\\nB. [[SMILES: NC(=O)[NH3+]]]\\\\nC. [[SMILES: N=C(O)N]]\\\\nD. [[SMILES: NC(O)=[NH2+]]]",
        "hint": "Consider which site of protonation in urea (oxygen vs. nitrogen) allows for resonance stabilization of the positive charge.",
        "explanation": "Protonation of urea occurs preferentially on oxygen (not nitrogen), because the resulting cation $\\\\ce{[(NH2)2C=OH]^+}$ is stabilized by resonance delocalization of the positive charge over both nitrogen atoms. The SMILES [[SMILES: NC(O)=[NH2+]]] represents the O-protonated form, option (D)."
    },
    {
        "id": "genchem_ex3",
        "qtype": "free_response",
        "reactants": "",
        "reagents": "",
        "conditions": "",
        "answer": "",
        "instructions": "Fluoride ions form a stable complex with aluminum(III): $\\\\ce{6F^- + Al^{3+} <=> [AlF6]^{3-}}$\\\\n\\\\nA fluoride sample was neutralized, saturated with $\\\\ce{NaCl}$, heated to $70-80\\\\ ^\\\\circ\\\\text{C}$, and titrated with $0.150\\\\text{ M } \\\\ce{AlCl3}$ until methyl red turned pink.\\\\n\\\\na. Write the equation at the endpoint and explain the role of $\\\\ce{NaCl}$.\\\\nb. Explain why heating increases endpoint sharpness.\\\\nc. In a back-titration, $0.500\\\\text{ g } \\\\ce{NaF}$ and excess $\\\\ce{NaCl}$ were added to a calcium sample. Titration with $0.1000\\\\text{ M } \\\\ce{AlCl3}$ required $10.25\\\\text{ cm}^3$. Calculate moles and mass of calcium.",
        "hint": "Focus on Al(III) hydrolysis at the endpoint. For quantitative parts, set up stoichiometric mole balances.",
        "explanation": "a. Excess $\\\\ce{Al^{3+}}$ hydrolyzes: $\\\\ce{[Al(H2O)6]^{3+} + H2O <=> [Al(OH)(H2O)5]^{2+} + H3O^+}$. $\\\\ce{NaCl}$ precipitates cryolite ($\\\\ce{Na3AlF6}$), driving complexation forward.\\\\nb. Al(III) hydrolysis is endothermic; heating produces more $\\\\ce{H3O^+}$ per excess $\\\\ce{Al^{3+}}$.\\\\nc. $n(\\\\ce{F^-}) = 0.500/41.99 = 0.01191$ mol. $n(\\\\ce{Al^{3+}}) = 0.001025$ mol. $n(\\\\ce{F^-})_{complexed} = 0.006150$ mol. $n(\\\\ce{F^-})_{ppt} = 0.00576$ mol. $n(\\\\ce{Ca^{2+}}) = 0.00288$ mol. $m = 0.115$ g."
    },
    {
        "id": "chem_ex1",
        "qtype": "multiple_choice",
        "reactants": "",
        "reagents": "",
        "conditions": "",
        "answer": "A",
        "instructions": "A weighed sample of a copper-nickel alloy is dissolved in a known volume of nitric acid. Which method is most suitable for determining the mass percent of copper in the alloy?\\\\n\\\\n(A) Treatment of an aliquot of the solution with excess iodide, followed by titration of the iodine produced with sodium thiosulfate.\\\\n(B) Measurement of the absorbance of the solution at a wavelength of light at which both $\\\\ce{Cu^{2+}}$ and $\\\\ce{Ni^{2+}}$ absorb, and comparison with the absorbances of known standards of the two ions.\\\\n(C) Addition of excess sodium hydroxide to the solution, isolation of the metal hydroxides by filtration, and measurement of the mass of the precipitate.\\\\n(D) Bubbling hydrogen gas through the solution and measuring the mass of the metal that precipitates from the solution.",
        "hint": "Method A exploits the selective redox: $\\\\ce{2Cu^{2+} + 4I^- -> 2CuI + I_2}$. The liberated $\\\\ce{I_2}$ is titrated with thiosulfate, giving moles of Cu specifically.",
        "explanation": "Method A exploits the selective redox: $\\\\ce{2Cu^{2+} + 4I^- -> 2CuI + I_2}$. The liberated $\\\\ce{I_2}$ is titrated with thiosulfate, giving moles of Cu specifically. $\\\\ce{Ni^{2+}}$ does not react with iodide under these conditions, so it does not interfere. Method B fails because both ions absorb at the same wavelength, making the absorbance non-specific. Method C fails because both $\\\\ce{Cu(OH)_2}$ and $\\\\ce{Ni(OH)_2}$ precipitate together. Method D fails because $\\\\ce{HNO_3}$ is a strong oxidizing agent that reacts with $\\\\ce{H_2}$ before it can reduce the metal ions."
    },
    {
        "id": "chem_ex2",
        "qtype": "free_response",
        "reactants": "",
        "reagents": "",
        "conditions": "",
        "answer": "NH4NO3",
        "instructions": "A is an ionic compound that contains only the elements hydrogen, nitrogen, and oxygen.\\\\n\\\\na. A 1.000-g sample of A is dissolved in 20 mL water and titrated with 0.5000 M NaOH solution, giving the data shown below. What is the molar mass of A?\\\\n\\\\n[[SVG: <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 620 400' style='max-width:100%;background:white'><rect x='60' y='20' width='520' height='320' fill='white'/><g stroke='#ddd' stroke-width='0.5'><line x1='60' y1='52' x2='580' y2='52'/><line x1='60' y1='84' x2='580' y2='84'/><line x1='60' y1='116' x2='580' y2='116'/><line x1='60' y1='148' x2='580' y2='148'/><line x1='60' y1='180' x2='580' y2='180'/><line x1='60' y1='212' x2='580' y2='212'/><line x1='60' y1='244' x2='580' y2='244'/><line x1='60' y1='276' x2='580' y2='276'/><line x1='60' y1='308' x2='580' y2='308'/><line x1='103' y1='20' x2='103' y2='340'/><line x1='147' y1='20' x2='147' y2='340'/><line x1='190' y1='20' x2='190' y2='340'/><line x1='233' y1='20' x2='233' y2='340'/><line x1='277' y1='20' x2='277' y2='340'/><line x1='320' y1='20' x2='320' y2='340'/><line x1='363' y1='20' x2='363' y2='340'/><line x1='407' y1='20' x2='407' y2='340'/><line x1='450' y1='20' x2='450' y2='340'/><line x1='493' y1='20' x2='493' y2='340'/><line x1='537' y1='20' x2='537' y2='340'/></g><rect x='60' y='20' width='520' height='320' fill='none' stroke='#999' stroke-width='1'/><g font-family='Arial,sans-serif' font-size='12' text-anchor='end' fill='black'><text x='55' y='24'>14</text><text x='55' y='56'>13</text><text x='55' y='88'>12</text><text x='55' y='120'>11</text><text x='55' y='152'>10</text><text x='55' y='184'>9</text><text x='55' y='216'>8</text><text x='55' y='248'>7</text><text x='55' y='280'>6</text><text x='55' y='312'>5</text><text x='55' y='344'>4</text></g><text font-family='Arial,sans-serif' font-size='14' font-weight='bold' text-anchor='middle' transform='translate(20,180) rotate(-90)'>pH</text><g font-family='Arial,sans-serif' font-size='12' text-anchor='middle' fill='black'><text x='60' y='358'>0</text><text x='103' y='358'>5</text><text x='147' y='358'>10</text><text x='190' y='358'>15</text><text x='233' y='358'>20</text><text x='277' y='358'>25</text><text x='320' y='358'>30</text><text x='363' y='358'>35</text><text x='407' y='358'>40</text><text x='450' y='358'>45</text><text x='493' y='358'>50</text><text x='537' y='358'>55</text><text x='580' y='358'>60</text></g><text x='320' y='390' font-family='Arial,sans-serif' font-size='14' text-anchor='middle'>mL 0.5000 M NaOH added</text><path d='M 60 314.4 C 60 250,68.7 237.6,77.3 218.4 S 103.3 192.8,146.7 173.6 S 190 160.8,233.3 144.8 S 268 109.6,276.7 77.6 S 285.3 68,320 58.4 S 406.7 48.8,580 42.4' fill='none' stroke='black' stroke-width='2'/></svg>]]\\\\n\\\\nb. When a 1.000-g sample of A is heated at 230 °C in an evacuated 1.50 L vessel, it decomposes into gaseous products, giving a final pressure of 784 mm Hg. How many moles of gas are formed in this reaction?\\\\n\\\\nc. If the gases produced from the decomposition of 1.000 g of A are instead first passed through a column packed with magnesium perchlorate (which strongly absorbs water vapor) and then collected at 25 °C and a pressure of 755 mm Hg, the total volume of gas is 308 mL. How many moles of gas are collected in this experiment?\\\\n\\\\nd. What is the formula of A? Explain your reasoning.",
        "hint": "Determine the molar mass and gas mole ratios from the titration curve and decomposition data.",
        "explanation": "(a) From titration curve endpoint at 25 mL: Moles OH- = 0.025 L * 0.5000 M = 0.0125 mol, Molar mass of A = 1.000 g / 0.0125 mol = 80.0 g/mol. (b) PV=nRT gives 0.0375 mol total gas. (c) 0.0125 mol dry gas. (d) 1:3 total gas ratio, 1:2 water ratio → NH4NO3."
    },
    {
        "id": "chem_ex3",
        "qtype": "multiple_choice",
        "reactants": "",
        "reagents": "",
        "conditions": "",
        "answer": "A",
        "instructions": "A diagram showing the thermodynamic stability of mercury-containing species as a function of pH and reduction potential (Pourbaix diagram) is shown below. What is $\\\\textbf{X}$?\\\\n\\\\n(A) $\\\\text{Hg}_2^{2+}(aq)$\\\\n(B) $\\\\text{Hg}_2\\\\text{O}(s)$\\\\n(C) $\\\\text{Hg(OH)}^+(aq)$\\\\n(D) $\\\\text{Hg(O)(OH)}(s)$\\\\n\\\\n[[SVG: <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 500 500' width='100%' height='100%' style='background-color: #ffffff;'>\\n  <line x1='80' y1='50' x2='80' y2='420' stroke='#cccccc' stroke-width='1' />\\n  <line x1='140' y1='50' x2='140' y2='420' stroke='#eeeeee' stroke-width='1' />\\n  <line x1='200' y1='50' x2='200' y2='420' stroke='#eeeeee' stroke-width='1' />\\n  <line x1='260' y1='50' x2='260' y2='420' stroke='#eeeeee' stroke-width='1' />\\n  <line x1='320' y1='50' x2='320' y2='420' stroke='#eeeeee' stroke-width='1' />\\n  <line x1='380' y1='50' x2='380' y2='420' stroke='#eeeeee' stroke-width='1' />\\n  <line x1='440' y1='50' x2='440' y2='420' stroke='#cccccc' stroke-width='1' />\\n  \\n  <line x1='80' y1='420' x2='440' y2='420' stroke='#000000' stroke-width='1.5' />\\n  <line x1='80' y1='50' x2='80' y2='420' stroke='#000000' stroke-width='1.5' />\\n  <line x1='440' y1='50' x2='440' y2='420' stroke='#cccccc' stroke-width='1' />\\n  <line x1='80' y1='50' x2='440' y2='50' stroke='#cccccc' stroke-width='1' />\\n\\n  <line x1='75' y1='50' x2='80' y2='50' stroke='#000000' stroke-width='1' />\\n  <text x='50' y='55' font-family='Arial' font-size='12' text-anchor='middle'>1.2</text>\\n  <line x1='75' y1='111.7' x2='80' y2='111.7' stroke='#000000' stroke-width='1' />\\n  <text x='50' y='116.7' font-family='Arial' font-size='12' text-anchor='middle'>1.0</text>\\n  <line x1='75' y1='173.3' x2='80' y2='173.3' stroke='#000000' stroke-width='1' />\\n  <text x='50' y='178.3' font-family='Arial' font-size='12' text-anchor='middle'>0.8</text>\\n  <line x1='75' y1='235' x2='80' y2='235' stroke='#000000' stroke-width='1' />\\n  <text x='50' y='240' font-family='Arial' font-size='12' text-anchor='middle'>0.6</text>\\n  <line x1='75' y1='296.7' x2='80' y2='296.7' stroke='#000000' stroke-width='1' />\\n  <text x='50' y='301.7' font-family='Arial' font-size='12' text-anchor='middle'>0.4</text>\\n  <line x1='75' y1='358.3' x2='80' y2='358.3' stroke='#000000' stroke-width='1' />\\n  <text x='50' y='363.3' font-family='Arial' font-size='12' text-anchor='middle'>0.2</text>\\n  <line x1='75' y1='420' x2='80' y2='420' stroke='#000000' stroke-width='1' />\\n  <text x='50' y='425' font-family='Arial' font-size='12' text-anchor='middle'>0.0</text>\\n\\n  <line x1='80' y1='420' x2='80' y2='425' stroke='#000000' stroke-width='1' />\\n  <text x='80' y='440' font-family='Arial' font-size='12' text-anchor='middle'>0</text>\\n  <line x1='131.4' y1='420' x2='131.4' y2='425' stroke='#000000' stroke-width='1' />\\n  <text x='131.4' y='440' font-family='Arial' font-size='12' text-anchor='middle'>2</text>\\n  <line x1='182.8' y1='420' x2='182.8' y2='425' stroke='#000000' stroke-width='1' />\\n  <text x='182.8' y='440' font-family='Arial' font-size='12' text-anchor='middle'>4</text>\\n  <line x1='234.3' y1='420' x2='234.3' y2='425' stroke='#000000' stroke-width='1' />\\n  <text x='234.3' y='440' font-family='Arial' font-size='12' text-anchor='middle'>6</text>\\n  <line x1='285.7' y1='420' x2='285.7' y2='425' stroke='#000000' stroke-width='1' />\\n  <text x='285.7' y='440' font-family='Arial' font-size='12' text-anchor='middle'>8</text>\\n  <line x1='337.1' y1='420' x2='337.1' y2='425' stroke='#000000' stroke-width='1' />\\n  <text x='337.1' y='440' font-family='Arial' font-size='12' text-anchor='middle'>10</text>\\n  <line x1='388.6' y1='420' x2='388.6' y2='425' stroke='#000000' stroke-width='1' />\\n  <text x='388.6' y='440' font-family='Arial' font-size='12' text-anchor='middle'>12</text>\\n  <line x1='440' y1='420' x2='440' y2='425' stroke='#000000' stroke-width='1' />\\n  <text x='440' y='440' font-family='Arial' font-size='12' text-anchor='middle'>14</text>\\n\\n  <text x='260' y='465' font-family='Arial' font-size='14' text-anchor='middle' font-weight='bold'>pH</text>\\n  <text x='25' y='235' font-family='Arial' font-size='14' text-anchor='middle' font-weight='bold' transform='rotate(-90,25,235)'>E°, V</text>\\n\\n  <line x1='120' y1='50' x2='120' y2='142.5' stroke='#000000' stroke-width='2' />\\n  <line x1='80' y1='142.5' x2='120' y2='142.5' stroke='#000000' stroke-width='2' />\\n  <line x1='120' y1='142.5' x2='145' y2='173.3' stroke='#000000' stroke-width='2' />\\n  <line x1='80' y1='173.3' x2='145' y2='173.3' stroke='#000000' stroke-width='2' />\\n  <line x1='145' y1='173.3' x2='440' y2='376' stroke='#000000' stroke-width='2' />\\n\\n  <text x='100' y='95' font-family='Arial' font-size='12' text-anchor='middle'>Hg²⁺</text>\\n  <text x='100' y='110' font-family='Arial' font-size='10' text-anchor='middle'>(aq)</text>\\n  \\n  <text x='100' y='162' font-family='Arial' font-size='14' text-anchor='middle' font-weight='bold'>X</text>\\n  \\n  <text x='310' y='125' font-family='Arial' font-size='12' text-anchor='middle'>HgO(s)</text>\\n  <text x='220' y='300' font-family='Arial' font-size='12' text-anchor='middle'>Hg(l)</text>\\n</svg>]]",
        "hint": "Consider the stability of mercury species in acidic conditions and intermediate reduction potentials.",
        "explanation": "Under acidic conditions (low pH) and intermediate reduction potentials (between metallic $\\\\text{Hg}(l)$ and $\\\\text{Hg}^{2+}(aq)$), mercury(I) exists as the stable diatomic cation $\\\\text{Hg}_2^{2+}(aq)$."
    },
    {
        "id": "chem_ex5",
        "qtype": "multiple_choice",
        "reactants": "",
        "reagents": "",
        "conditions": "",
        "answer": "B",
        "instructions": "A solution initially is $0.10$ M in both $\\\\ce{Cd^{2+}}$ and $\\\\ce{Tl^+}$ and is kept saturated with hydrogen sulfide gas ($[\\\\ce{H2S}] = 0.1$ M). In what pH range will one of the metal ions be precipitated quantitatively ($> 99.9\\\\%$) while the other remains completely in solution?\\\\n\\\\n(A) Between $0.5$ and $6.8$\\\\n(B) Between $2.0$ and $3.9$\\\\n(C) Between $4.0$ and $6.8$\\\\n(D) There is no pH at which this is possible.\\\\n\\\\n$K_{\\\\text{sp}}\\\\text{ of CdS} = 1.0 \\\\times 10^{-27} \\\\quad K_{\\\\text{sp}}\\\\text{ of Tl}_2\\\\text{S} = 6.0 \\\\times 10^{-22}$\\\\n$K_{\\\\text{a}}\\\\text{ of H}_2\\\\text{S} = 8.9 \\\\times 10^{-8} \\\\quad K_{\\\\text{a}}\\\\text{ of HS}^- = 1.0 \\\\times 10^{-19}$",
        "hint": "Determine the concentration of sulfide ion needed to quantitatively precipitate CdS without exceeding the solubility limit of Tl2S.",
        "explanation": "For $\\\\ce{CdS}$ to precipitate quantitatively ($>99.9\\\\%$), $[\\\\ce{Cd^{2+}}] < 1.0 \\\\times 10^{-4}$ M. Thus, $[\\\\ce{S^{2-}}] \\\\ge \\\\frac{K_{\\\\text{sp}}(\\\\text{CdS})}{1.0 \\\\times 10^{-4}} = 1.0 \\\\times 10^{-23}$ M. For $\\\\ce{Tl2S}$ to NOT precipitate: $(0.10)^2 [\\\\ce{S^{2-}}] < 6.0 \\\\times 10^{-22} \\\\implies [\\\\ce{S^{2-}}] < 6.0 \\\\times 10^{-20}$ M. Using $K_{a1} K_{a2} = [H^+]^2[S^{2-}]/[H_2S]$, pH must be between approximately $2.0$ and $3.9$."
    },
    {
        "id": "chem_ex6",
        "qtype": "multiple_choice",
        "reactants": "",
        "reagents": "",
        "conditions": "",
        "answer": "A",
        "instructions": "The melting points of the group 6 elements increase in the order Cr ($2180\\ ^\\circ\\text{C}$) < Mo ($2896\\ ^\\circ\\text{C}$) < W ($3695\\ ^\\circ\\text{C}$). Which is the best explanation for this trend?\\\\n\\\\n(A) The degree of covalency increases down the group.\\\\n(B) The partial positive charge on the metal atoms in the lattice increases down the group.\\\\n(C) The valence orbitals become increasingly contracted down the group due to relativistic effects.\\\\n(D) The packing density of the metals increases down the group as the lattice changes from simple cubic to body-centered cubic to face-centered cubic.",
        "hint": "Melting points of transition metals depend on metallic bonding strength, which has a significant covalent component.",
        "explanation": "For transition metals, melting points depend strongly on the strength of metallic bonding, which has a significant covalent component due to the sharing of d-electrons. As we move down Group 6 (Cr to Mo to W), the 3d, 4d, and 5d orbitals become larger and more diffuse, resulting in better overlap and stronger covalent contribution to the metallic bonding in the solid state. This leads to a higher melting point."
    },
    {
        "id": "chem_ex7",
        "qtype": "multiple_choice",
        "reactants": "",
        "reagents": "",
        "conditions": "",
        "answer": "B",
        "instructions": "Which statements regarding the standard reduction potentials of the group 14 element dioxides $\\\\ce{XO2}$ are correct?\\\\n\\\\n$$\\\\ce{XO2} + 4\\\\text{ H}^+(aq) + 4\\\\text{ e}^- \\\\rightarrow \\\\text{X}(s) + 2\\\\text{ H2O}(l) \\\\quad E^\\\\circ(\\\\text{X})$$\\\\n\\\\nI. $E^\\\\circ(\\\\text{C}) < E^\\\\circ(\\\\text{Si})$ \\\\quad\\\\quad\\\\quad II. $E^\\\\circ(\\\\text{Sn}) < E^\\\\circ(\\\\text{Pb})$\\\\n\\\\n(A) I only\\\\n(B) II only\\\\n(C) Both I and II\\\\n(D) Neither I nor II",
        "hint": "Compare the stability of silicon dioxide (network solid) vs carbon dioxide (molecular gas), and consider the inert pair effect down Group 14.",
        "explanation": "Statement I is false: silicon dioxide is much more thermodynamically stable (network solid) than carbon dioxide (molecular gas), so $E^\\\\circ(\\\\text{Si}) < E^\\\\circ(\\\\text{C})$. Statement II is correct: due to the inert pair effect, $\\\\ce{PbO2}$ is easily reduced (strongly oxidizing), so $E^\\\\circ(\\\\text{Sn}) < E^\\\\circ(\\\\text{Pb})$. The answer is (B)."
    },
    {
        "id": "chem_ex10",
        "qtype": "multiple_choice",
        "reactants": "",
        "reagents": "",
        "conditions": "",
        "answer": "C",
        "instructions": "The cathodic compartment of an electrolytic cell is $0.100$ M in the ions $\\\\ce{Fe(CN)6^{3-}}$ and $\\\\ce{Cu^{2+}}$ and has a chemically inert electrode. As current is passed through the cell, which best describes how $\\\\ce{Cu}(s)$ is deposited on the electrode?\\\\n\\\\n$$\\\\begin{array}{|c|c|} \\\\hline \\\\text{Half-reaction} & E^\\\\circ\\\\text{, V} \\\\\\\\ \\\\hline \\\\ce{Cu^{2+}}(aq) + 2e^- \\\\rightarrow \\\\ce{Cu}(s) & +0.337 \\\\\\\\ \\\\hline \\\\ce{Fe(CN)6^{3-}} + e^- \\\\rightarrow \\\\ce{Fe(CN)6^{4-}} & +0.370 \\\\\\\\ \\\\hline \\\\end{array}$$\\\\n\\\\n(A) Copper is deposited immediately, but at a rate much lower than 1 mol per 193000 C. As the electrolysis proceeds, the rate of copper deposition increases.\\\\n(B) Copper is deposited immediately, at a rate close to 1 mol per 193000 C. As the electrolysis proceeds, the rate of copper deposition decreases.\\\\n(C) No copper is deposited for a certain length of time, then copper deposition begins.\\\\n(D) Copper is deposited at a rate of 1 mol per 193000 C for a certain length of time, then the rate of copper deposition decreases.",
        "hint": "Compare the standard reduction potentials to see which species is more easily reduced at the cathode first.",
        "explanation": "The standard reduction potential for the reduction of $\\\\ce{Fe(CN)6^{3-}}$ to $\\\\ce{Fe(CN)6^{4-}}$ ($+0.370$ V) is higher than that for the reduction of $\\\\ce{Cu^{2+}}$ to $\\\\ce{Cu}(s)$ ($+0.337$ V). Therefore, $\\\\ce{Fe(CN)6^{3-}}$ is reduced first at the cathode, and copper deposition begins only after a certain period of time — option (C)."
    },
    {
        "id": "chem_ex11",
        "qtype": "multiple_choice",
        "reactants": "",
        "reagents": "",
        "conditions": "",
        "answer": "A",
        "instructions": "Which statement best describes the differences between a $0.1$ M solution of ammonium bicarbonate, $\\\\ce{NH4(HCO3)}$, and a $0.1$ M solution of ammonium carbonate, $\\\\ce{(NH4)2CO3}$?\\\\n\\\\n(A) The pH of the ammonium bicarbonate solution is lower because bicarbonate is a weaker base than carbonate.\\\\n(B) The pH of the ammonium bicarbonate solution is lower because both ammonium ion and bicarbonate ion can act as Brønsted acids.\\\\n(C) The pH of the ammonium bicarbonate solution is higher because it has only half the ammonium ion concentration of the ammonium carbonate solution.\\\\n(D) The pH of the ammonium bicarbonate solution is higher because it contains only two-thirds as many total ions as the ammonium carbonate solution.",
        "hint": "Compare the base dissociation constants of carbonate and bicarbonate ions, and their stoichiometries.",
        "explanation": "Ammonium carbonate contains two moles of the acidic $\\\\ce{NH4+}$ ion and one mole of the basic $\\\\ce{CO3^{2-}}$ ion per mole of compound, whereas ammonium bicarbonate contains one mole of $\\\\ce{NH4+}$ and one mole of $\\\\ce{HCO3-}$ per mole of compound. The carbonate ion ($\\\\ce{CO3^{2-}}$) has a much higher $K_b$ than bicarbonate ($\\\\ce{HCO3-}$). Because bicarbonate is a much weaker base than carbonate, the pH of the ammonium bicarbonate solution is significantly lower — making (A) the correct choice."
    }
];

function getRandomGenchemExemplars(count = 3) {
    if (genchemExemplars.length <= count) {
        return [...genchemExemplars].sort(() => 0.5 - Math.random());
    }
    const shuffled = [...genchemExemplars].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

function formatGenchemExemplarsForPrompt(exemplars) {
    return exemplars.map(ex => {
        const clone = { ...ex };
        delete clone.id;
        return JSON.stringify(clone, null, 2);
    }).join('\n\n');
}

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

function extractTextFromInteraction(interaction) {
    if (!interaction) return '';
    if (interaction.steps && Array.isArray(interaction.steps)) {
        const modelSteps = interaction.steps.filter(s => s.type === 'model_output');
        if (modelSteps.length > 0) {
            const lastStep = modelSteps[modelSteps.length - 1];
            if (lastStep.content && Array.isArray(lastStep.content)) {
                return lastStep.content
                    .filter(c => c.type === 'text')
                    .map(c => c.text)
                    .join('');
            }
        }
    }
    if (interaction.output_text) {
        return interaction.output_text;
    }
    return '';
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { prompt, image, responseMimeType, task, gradeMode, stream, mode } = req.body;
    const isGenChem = mode === 'genchem';
    const isFreeDraw = mode === 'freedraw';

    let keys = [
        process.env.api_1,
        process.env.api_2,
        process.env.api_3,
        process.env.api_4,
        process.env.api_5,
        process.env.api_6,
        process.env.api_7,
        process.env.api_8,
        process.env.api_9,
        process.env.api_10,
        process.env.api_11,
        process.env.api_12,
        process.env.api_13,
        process.env.api_14,
        process.env.api_15,
        process.env.api_16,
        process.env.api_17,
        process.env.api_18,
        process.env.api_19,
        process.env.api_20,
        process.env.api_21,
        process.env.api_22,
        process.env.api_23,
        process.env.api_24,
        process.env.api_25
    ];

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

    const GENERATION_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
    const GRADING_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
    const models = (task === 'generate') ? GENERATION_MODELS : GRADING_MODELS;

    const temperature = (task === 'generate') ? 1.5 : 0.2;
    const topP = (task === 'generate') ? 0.95 : 0.8;
    const maxOutputTokens = (task === 'generate') ? 8192 : 1024;

    // Build URL correctly
    function buildUrl(apiKey) {
        return `https://generativelanguage.googleapis.com/v1beta/interactions?key=${apiKey}`;
    }

    // Pipe a Web ReadableStream to a Node.js ServerResponse (Vercel compatible)
    async function pipeStreamToResponse(webStream, res) {
        const reader = webStream.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        function processSSELine(line, responseStream) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
                const dataStr = trimmed.substring(6).trim();
                try {
                    const parsed = JSON.parse(dataStr);
                    if (parsed.event_type === 'step.delta' && parsed.delta && parsed.delta.type === 'text' && parsed.delta.text) {
                        const legacyData = {
                            candidates: [{
                                content: {
                                    parts: [{
                                        text: parsed.delta.text
                                    }]
                                }
                            }]
                        };
                        responseStream.write(`data: ${JSON.stringify(legacyData)}\n\n`);
                    }
                } catch (e) {
                    // Fragmented or heartbeat
                }
            }
        }

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    if (buffer) {
                        processSSELine(buffer, res);
                    }
                    break;
                }
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    processSSELine(line, res);
                }
            }
        } catch (err) {
            console.error("Stream piping error:", err);
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

        async function tryModelWithKey(apiKey) {
            // Build system instruction text
            let systemText = null;
            if (task === 'generate') {
                systemText = isGenChem
                    ? GENCHEM_GENERATION_SYSTEM_INSTRUCTION.replace('{{EXAMPLES}}', formatGenchemExemplarsForPrompt(getRandomGenchemExemplars(3)))
                    : GENERATION_SYSTEM_INSTRUCTION;
            } else if (task === 'grade' && gradeMode) {
                if (isFreeDraw) {
                    systemText = (gradeMode === 'learn') ? FREEDRAW_GRADING_LEARN_SYSTEM_INSTRUCTION : FREEDRAW_GRADING_NORMAL_SYSTEM_INSTRUCTION;
                } else if (isGenChem) {
                    systemText = (gradeMode === 'learn') ? GENCHEM_GRADING_LEARN_SYSTEM_INSTRUCTION : GENCHEM_GRADING_NORMAL_SYSTEM_INSTRUCTION;
                } else {
                    systemText = (gradeMode === 'learn') ? GRADING_LEARN_SYSTEM_INSTRUCTION : GRADING_NORMAL_SYSTEM_INSTRUCTION;
                }
            }

            const genConfig = {
                thinking_level: 'low'
            };

            const input = [];
            if (image) {
                input.push({
                    type: 'image',
                    mime_type: 'image/jpeg',
                    data: image
                });
            }
            input.push({
                type: 'text',
                text: prompt
            });

            const bodyPayload = {
                model: `models/${modelId}`,
                input,
                generation_config: genConfig,
                response_format: {
                    type: 'text',
                    mime_type: responseMimeType || "text/plain"
                }
            };

            if (systemText) {
                bodyPayload.system_instruction = systemText;
            }

            if (stream) {
                bodyPayload.stream = true;
            }

            const response = await fetch(buildUrl(apiKey), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Api-Revision': '2026-05-20'
                },
                body: JSON.stringify(bodyPayload)
            });

            const errBody = !response.ok ? await response.json().catch(() => ({})) : null;
            return { response, errBody };
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
                    const interactionData = await result.response.json();
                    const extractedText = extractTextFromInteraction(interactionData);
                    const legacyResponse = {
                        candidates: [{
                            content: {
                                parts: [{
                                    text: extractedText
                                }]
                            }
                        }]
                    };
                    return res.status(200).json(legacyResponse);
                }

                const status = result.response.status;
                const errBody = result.errBody;
                // 503 = overloaded, 500 = high demand — both should downgrade immediately, not rotate keys
                const isBusy = status === 503 || status === 500 || (errBody?.error?.message && /busy|overloaded/i.test(errBody.error.message));

                if (isBusy) {
                    console.warn(`[${task}] ${modelId} busy/overloaded on key #${keyIndex + 1}. Breaking key loop to try next model.`, errBody);
                    lastError = { status, data: errBody };
                    break;
                } else if (status === 429) {
                    console.warn(`[429] Rate limit hit for ${modelId} on key #${keyIndex + 1}. Marking as rate limited for the rest of the day.`);
                    markKeyRateLimitedForModel(modelId, apiKey);
                } else {
                    console.warn(`[${task}] ${modelId} failed on key #${keyIndex + 1} with status ${status}. Trying next key...`, errBody);
                    lastError = { status, data: errBody };
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
    if (task === 'chat' || task === 'grade') {
        return res.status(lastError?.status || 503).json({
            error: "Sorry, the bot is busy right now. Try again later."
        });
    }
    res.status(lastError?.status || 500).json({
        error: lastError?.data?.error?.message || 'All models are currently at capacity. Please try again later.'
    });
}