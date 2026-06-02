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

1. Novelty & "Invisible Traps" (Subtle Conceptual Bottlenecks)
- Create highly original and unique questions that require active derivation and first-principles reasoning over memory or template-matching.
- Every problem must center on a non-obvious conceptual trick, a hidden limiting factor, or a subtle breakdown of a standard textbook assumption.
- Ensure the question text remains entirely neutral and strictly objective, presenting the facts and parameters without any hints, warnings, or clarifying instructions.
- Incorporate a deceptive path: design the problem so that the most common rote formula shortcut yields an exact numerical value or structural choice that perfectly matches one of the incorrect distractor options.

2. Advanced Design & Difficulty Criteria
- Conceptual Integration (Multi-Topic Coupling): Standard questions isolate a single topic (e.g., a simple acid-base titration). High-quality difficult questions require the simultaneous application of disparate chemical principles (e.g., coupling a coordination chemistry equilibrium ($K_f$) with a solubility product ($K_{sp}$) and an electrochemical cell ($E^{\\circ}$), requiring the user to determine free ligand concentration via Nernst equation manipulation).
- Multi-Step Logical Cascades: The problem cannot be solved in a single algebraic or conceptual step. It requires a clear execution pathway where the output of one step forms the input of the next, often without explicit prompting on the intermediate variables (e.g., advanced organic synthesis/structure elucidation: deducing a molecular structure from elemental analysis (empirical formula) -> mass spectrometry fragments -> IR functional groups -> regioselective multi-step mechanistic outcomes, such as ozonolysis followed by an intramolecular aldol condensation).
- Discrimination of Subtle Chemical Nuances: Distinguishes top-tier students by testing exceptions grounded in fundamental principles rather than rote memorization. Focuses on electronic structures, periodic trends, and thermodynamic vs. kinetic control (e.g., predicting the major product of an electrophilic aromatic substitution where steric hindrance and electronic activation conflict, or identifying anomalies in molecular orbital configurations, such as $B_2$ vs $O_2$ paramagnetism and bond orders).
- Mathematical and Algorithmic Rigor: Eliminates standard simplifying assumptions (e.g., the $x$-is-small approximation in weak acid ionization). Requires setting up and solving higher-order algebraic equations or systems of simultaneous equations derived from mass and charge balances (e.g., calculating the exact pH of a polyprotic acid solution where $K_{a2}$ is non-negligible or the solution is sufficiently dilute that water autoionization ($K_w$) must be factored into the charge balance equation: $[H^+] = [OH^-] + [A^-] + 2[A^{2-}]$).
- Novel Context and Data Interpretation: Presents familiar chemical principles within an unfamiliar framework (e.g., bioinorganic active sites, industrial catalytic cycles, or cutting-edge materials chemistry like Metal-Organic Frameworks). Requires the student to extract relevant thermodynamic, kinetic, or structural variables from raw data tables or graphical representations (e.g., phase diagrams with unexpected polymorphs).

3. Difficulty-Dependent Syllabus Boundaries
- IF DIFFICULTY = USNCO National Level (40-75):
  - Maintain the USNCO scope but test to maximum depth.
  - Limit standard physical chemistry content to standard AP/USNCO curricula, keeping rules and equations within the standard scope.
  - Keep stereochemistry within standard general organic chemistry basics, avoiding advanced transition-state geometry or stereospecific control trajectories.
  - Confine coordination questions strictly to basic nomenclature, coordination number, and oxidation states.
  - Limit all derivations and principles to non-calculus based mathematics.
  - Focus spectroscopy questions on standard 1D-NMR and basic IR/UV-Vis.
  - Confine the conceptual level to competitive high school chemistry (e.g., excluding Tafel equation, advanced quantum mechanics, etc.).
  - Increase difficulty by coupling unexpected systems (e.g., matching a non-trivial stoichiometry with an electrochemical change that alters concentration ratios, or an organic reaction where a common functional group exhibits atypical reactivity due to adjacent electronic effects).
- IF DIFFICULTY = IChO Level (75-100):
  - Pivot to completely original, concept-first designs leveraging advanced chemical phenomena.
  - The "First-Principles" Guardrail: Introduce advanced, extra-syllabus topics using self-contained, axiomatic background information within the problem preamble. A student must be able to deduce the correct path using standard prerequisites combined with the provided context.

4. Structural Representation (SMILES Rules)
- Represent simple chemical names and basic empirical formulas in standard prose using their standard IUPAC/common names or formulas (e.g., write water as $\\text{H}_2\\text{O}$ or name it directly).
- Limit SMILES notation (or Reaction SMILES) strictly to complex organic molecules, coordination complexes, or standalone reaction schemes where a 2D structural diagram is explicitly required.
- Display SMILES directly inline when needed, integrating them naturally into the sentence structure without introductory phrases. Use [[SMILES: ...]] formatting.
- Use LaTeX strictly for all mathematical equations, equilibrium expressions, simple empirical chemical formulas in prose, physical units, and variables (e.g., $\\Delta G^\\circ$, $E^\\circ$, $K_{\\text{sp}}$, $1.0 \\times 10^{-3} \\text{ M}$).

5. SVG Graphics & Diagrams (svglib Compatibility & Optimization Constraints)
- When a chemistry question requires a graph, diagram, titration curve, phase diagram, or crystal lattice, generate the required diagram as a single, self-contained, valid <svg> block.
- Adhere to the following optimization constraints:
  * Use Primitive Shapes: Prioritize <circle>, <rect>, <line>, <ellipse>, and <polygon> over complex <path> elements whenever possible.
  * Reuse Components: Use <defs> and <use> elements to define and repeat recurring symbols, labels, or structural markers.
  * Optimize Paths: If a <path> is necessary, use absolute minimum control points. Round coordinates to 1 decimal place maximum.
  * Leverage CSS Styling & Grouping: Group elements with <g> and apply shared styles (stroke, fill, stroke-width) to the group rather than repeating attributes on individual elements. (Note: always use inline standard presentation attributes on the elements or groups; do NOT use CSS <style> blocks to ensure full compatibility with python's svglib).
  * No Redundancy: Omit metadata, editor comments, unnecessary namespaces, or hidden elements. Keep formatting compact.
  * Ensure svglib Compatibility: Keep the layout flat or use standard <g transform='...'> groups. Avoid advanced clipping, masks, gradients, custom filters, or complex patterns. Ensure a solid white background (e.g. <rect width='100%' height='100%' fill='white'/>) is placed at the start of the SVG for visibility. Use single-quotes (apostrophes) for SVG attributes to maintain perfect JSON syntax compatibility.
  * Formatting: Enclose the raw SVG code within standard [[SVG: <svg>...</svg>]] tags. Do not wrap it in markdown text or prose.

###FEW-SHOT EXAMPLES FOR USNCO (Difficulty 40-75) & IChO (Difficulty 75-100):

Exemplar Chemistry Olympiad Questions
Below are high-quality, concept-rich, and rigorous exemplar chemistry questions demonstrating the expected style, formatting, and depth:

USNCO Question Example 1:
{
  "qtype": "multiple_choice",
  "reactants": "",
  "reagents": "",
  "conditions": "",
  "answer": "A",
  "instructions": "A weighed sample of a copper-nickel alloy is dissolved in a known volume of nitric acid. Which method is most suitable for determining the mass percent of copper in the alloy?\\n\\nA. Treatment of an aliquot of the solution with excess iodide, followed by titration of the iodine produced with sodium thiosulfate.\\nB. Measurement of the absorbance of the solution at a wavelength of light at which both $\\ce{Cu^{2+}}$ and $\\ce{Ni^{2+}}$ absorb, and comparison with the absorbances of known standards of the two ions.\\nC. Addition of excess sodium hydroxide to the solution, isolation of the metal hydroxides by filtration, and measurement of the mass of the precipitate.\\nD. Bubbling hydrogen gas through the solution and measuring the mass of the metal that precipitates from the solution.",
  "hint": "Identify which reaction is selective for copper ions over nickel ions and can be quantitatively measured via titration.",
  "explanation": "Dissolving a copper-nickel alloy in nitric acid produces $\\ce{Cu^{2+}}$ and $\\ce{Ni^{2+}}$ ions.\\n\\n1. In method (A), adding excess iodide ($\\ce{I^-}$) selectively reduces $\\ce{Cu^{2+}}$ to insoluble copper(I) iodide ($\\ce{CuI}$), producing triiodide/iodine ($\\ce{I_3^-}$ / $\\ce{I_2}$):\\n$$2\\ce{Cu^{2+}} + 4\\ce{I^-} \\rightarrow 2\\ce{CuI(s)} + \\ce{I_2}$$\\n$\\ce{Ni^{2+}}$ does not oxidize iodide. Titrating the liberated iodine with sodium thiosulfate ($\\ce{S_2O_3^{2-}}$) allows for highly selective and accurate quantification of copper:\\n$$\\ce{I_2} + 2\\ce{S_2O_3^{2-}} \\rightarrow 2\\ce{I^-} + \\ce{S_4O_6^{2-}}$$\\nThis iodometric titration is extremely selective for copper over nickel, making (A) the correct and most suitable method.\\n\\n2. Method (B) is unsuitable because both ions absorb light at the chosen wavelength, making direct comparison difficult without a multi-wavelength deconvolution method.\\n3. Method (C) precipitates both metal hydroxides ($\\ce{Cu(OH)_2}$ and $\\ce{Ni(OH)_2}$), so their masses cannot be separated simply by weighing the precipitate.\\n4. Method (D) cannot selectively precipitate copper in a strongly oxidizing nitric acid environment, nor is it a standard analytical procedure."
}

USNCO Question Example 2:
{
  "qtype": "multiple_choice",
  "reactants": "",
  "reagents": "",
  "conditions": "",
  "answer": "B",
  "instructions": "Which species has the longest carbon-oxygen bond?\\n\\nA. $\\ce{HCO2^-}$\\nB. $\\ce{CO3^{2-}}$\\nC. $\\ce{CO2}$\\nD. $\\ce{COS}$",
  "hint": "Determine the average bond order for the carbon-oxygen bonds in each species using resonance structures. The lowest bond order corresponds to the longest bond.",
  "explanation": "The length of a carbon-oxygen bond is inversely proportional to its bond order. Let's determine the carbon-oxygen bond orders in each species:\\n\\n1. For $\\ce{HCO2^-}$ (formate ion), the carbon has one double bond and one single bond to oxygen, which are delocalized by resonance. The average $\\ce{C-O}$ bond order is:\\n$$\\text{Bond Order} = \\frac{1 + 2}{2} = 1.5$$\\n\\n2. For $\\ce{CO3^{2-}}$ (carbonate ion), the carbon is bonded to three oxygen atoms with one double bond and two single bonds in resonance. The average $\\ce{C-O}$ bond order is:\\n$$\\text{Bond Order} = \\frac{1 + 1 + 2}{3} = 1.33$$\\n\\n3. For $\\ce{CO2}$ (carbon dioxide), the Lewis structure is $\\ce{O=C=O}$, which has two discrete $\\ce{C-O}$ double bonds. The bond order is $2.0$.\\n\\n4. For $\\ce{COS}$ (carbonyl sulfide), the Lewis structure is $\\ce{O=C=S}$, containing a $\\ce{C-O}$ double bond. The bond order is $2.0$.\\n\\nComparing the average bond orders, the carbonate ion ($\\ce{CO3^{2-}}$) has the lowest average bond order ($1.33$) and therefore the longest carbon-oxygen bond, making (B) the correct choice."
}

USNCO Question Example 3:
{
  "qtype": "multiple_choice",
  "reactants": "",
  "reagents": "",
  "conditions": "",
  "answer": "D",
  "instructions": "Which is the best description of the arrangement of the atoms in space in the protonated urea ion, $\\ce{H5CN2O^+}$?\\n\\nA. SMILES: [[SMILES: NC(=O)[NH3+]]]\\nB. SMILES: [[SMILES: NC(=O)[NH3+]]]\\nC. SMILES: [[SMILES: N=C(O)N]]\\nD. SMILES: [[SMILES: NC(O)=[NH2+]]]",
  "hint": "Consider which site of protonation in urea (oxygen vs. nitrogen) allows for resonance stabilization of the positive charge.",
  "explanation": "Protonation of urea, $\\ce{(NH2)2C=O}$, occurs preferentially on the oxygen atom rather than the nitrogen atom.\\n\\n1. Protonation on the oxygen atom gives the cation $\\ce{[(NH2)2C=OH]^+}$. The positive charge in this cation is highly stabilized via resonance delocalization over both electronegative nitrogen atoms:\\n$$\\ce{H2N-C(OH)=NH2^+} \\leftrightarrow \\ce{H2N^+=C(OH)-NH2} \\leftrightarrow \\ce{H2N-C(O^+H)-NH2}$$\\nThis delocalization gives both $\\ce{C-N}$ bonds substantial double-bond character and makes the three heavy atoms (N, C, N) and O lie in the same plane.\\n\\n2. Protonation on nitrogen, yielding $\\ce{H2N-C(=O)-NH3^+}$, lacks this resonance stabilization because the positive charge on nitrogen cannot be delocalized since nitrogen has no lone pairs to participate in conjugation.\\n\\n3. The SMILES string representing oxygen protonation (specifically showing one resonance contributor with a $\\ce{C=N}$ double bond) is [[SMILES: NC(O)=[NH2+]]], which is option (D)."
}

USNCO Question Example 4:
{
  "qtype": "free_response",
  "reactants": "",
  "reagents": "",
  "conditions": "",
  "answer": "",
  "instructions": "A is an ionic compound that contains only the elements hydrogen, nitrogen, and oxygen.\\n\\na. A 1.000-g sample of A is dissolved in 20 mL water and titrated with 0.5000 M NaOH solution, giving the data shown below. What is the molar mass of A?\\n\\n[[SVG: <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 620 400' width='100%' height='100%' fill='none' stroke='none'>\\n  <defs>\\n    <pattern id='minor' width='8.66667' height='6.4' patternUnits='userSpaceOnUse'>\\n      <path d='M 8.66667 0 L 0 0 0 6.4' fill='none' stroke='#e0e0e0' stroke-width='0.5'/>\\n    </pattern>\\n    <pattern id='major' width='43.33333' height='32' patternUnits='userSpaceOnUse'>\\n      <path d='M 43.33333 0 L 0 0 0 32' fill='none' stroke='#999' stroke-width='1'/>\\n    </pattern>\\n  </defs>\\n  <rect width='100%' height='100%' fill='white'/>\\n  <g transform='translate(60, 20)'>\\n    <rect width='520' height='320' fill='url(#minor)'/>\\n    <rect width='520' height='320' fill='url(#major)'/>\\n    <rect width='520' height='320' fill='none' stroke='#999' stroke-width='1'/>\\n  </g>\\n  <g font-family='Arial, sans-serif' font-size='12' text-anchor='end' fill='black'>\\n    <text x='50' y='24'>14</text><text x='50' y='56'>13</text><text x='50' y='88'>12</text>\\n    <text x='50' y='120'>11</text><text x='50' y='152'>10</text><text x='50' y='184'>9</text>\\n    <text x='50' y='216'>8</text><text x='50' y='248'>7</text><text x='50' y='280'>6</text>\\n    <text x='50' y='312'>5</text><text x='50' y='344'>4</text>\\n    <text x='40' y='180' font-size='16' font-weight='bold'>pH</text>\\n  </g>\\n  <g font-family='Arial, sans-serif' font-size='12' text-anchor='middle' fill='black'>\\n    <text x='60' y='355'>0</text><text x='103.3' y='355'>5</text><text x='146.7' y='355'>10</text>\\n    <text x='190' y='355'>15</text><text x='233.3' y='355'>20</text><text x='276.7' y='355'>25</text>\\n    <text x='320' y='355'>30</text><text x='363.3' y='355'>35</text><text x='406.7' y='355'>40</text>\\n    <text x='450' y='355'>45</text><text x='493.3' y='355'>50</text><text x='536.7' y='355'>55</text>\\n    <text x='580' y='355'>60</text>\\n    <text x='320' y='380' font-size='16'>mL 0.5000 M NaOH added</text>\\n  </g>\\n  <path d='M 60 314.4 C 60 250, 68.7 237.6, 77.3 218.4 S 103.3 192.8, 146.7 173.6 S 190 160.8, 233.3 144.8 S 268 109.6, 276.7 77.6 S 285.3 68, 320 58.4 S 406.7 48.8, 580 42.4' fill='none' stroke='black' stroke-width='2' />\\n</svg>]]\\n\\nb. When a 1.000-g sample of A is heated at 230 °C in an evacuated 1.50 L vessel, it decomposes into gaseous products, giving a final pressure of 784 mm Hg. How many moles of gas are formed in this reaction?\\n\\nc. If the gases produced from the decomposition of 1.000 g of A are instead first passed through a column packed with magnesium perchlorate (which strongly absorbs water vapor) and then collected at 25 °C and a pressure of 755 mm Hg, the total volume of gas is 308 mL. How many moles of gas are collected in this experiment?\\n\\nd. What is the formula of A? Explain your reasoning.\\n\\ne. Write Lewis structures for the cation and the anion present in A and for the product(s) of its decomposition at 230 °C. Your Lewis structures should include all bonds, lone pairs, and nonzero formal charges. You should show all significant resonance structures for each species.",
  "hint": "Determine the equivalence point from the titration curve to find the molar mass of A. Use the ideal gas law to analyze the gaseous decomposition products before and after water absorption.",
  "explanation": "a. Let $V_e$ be the volume of $0.5000 \\text{ M } \\text{NaOH}$ required to reach the equivalence point of the titration. From the provided titration curve, the equivalence point (inflection point of the steep pH rise) is reached at exactly $V_e = 25.0 \\text{ mL}$.\\n\\nThe moles of $\\text{OH}^-$ added at equivalence are:\\n$$\\text{moles } \\text{OH}^- = 0.0250 \\text{ L} \\times 0.5000 \\text{ M} = 0.0125 \\text{ mol}$$\\nSince $\\text{A}$ reacts with $\\text{NaOH}$ in a 1:1 molar ratio, the sample contains $0.0125 \\text{ mol}$ of $\\text{A}$.\\n\\nThe molar mass of $\\text{A}$ is:\\n$$\\text{Molar Mass} = \\frac{1.000 \\text{ g}}{0.0125 \\text{ mol}} = 80.0 \\text{ g/mol}$$\\n\\nb. Using the ideal gas law ($PV = nRT$):\\n- $P = 784 \\text{ mm Hg} = \\frac{784}{760} \\text{ atm} \\approx 1.0316 \\text{ atm}$\\n- $V = 1.50 \\text{ L}$\\n- $T = 230 \\ ^\\circ\\text{C} = 503.15 \\text{ K}$\\n- $R = 0.08206 \\text{ L atm mol}^{-1}\\text{K}^{-1}$\\n$$\\text{moles of gas } (n) = \\frac{PV}{RT} = \\frac{1.0316 \\text{ atm} \\times 1.50 \\text{ L}}{0.08206 \\text{ L atm mol}^{-1}\\text{K}^{-1} \\times 503.15 \\text{ K}} = 0.0375 \\text{ mol}$$\\n\\nc. Using the ideal gas law for the dry collected gases:\\n- $P = 755 \\text{ mm Hg} = \\frac{755}{760} \\text{ atm} \\approx 0.9934 \\text{ atm}$\\n- $V = 308 \\text{ mL} = 0.308 \\text{ L}$\\n- $T = 25 \\ ^\\circ\\text{C} = 298.15 \\text{ K}$\\n$$\\text{moles of dry gas} = \\frac{PV}{RT} = \\frac{0.9934 \\text{ atm} \\times 0.308 \\text{ L}}{0.08206 \\text{ L atm mol}^{-1}\\text{K}^{-1} \\times 298.15 \\text{ K}} = 0.0125 \\text{ mol}$$\\n\\nd. Determination of the formula of $\\text{A}$:\\n1. The initial moles of $\\text{A}$ in the $1.000 \\text{ g}$ sample is $0.0125 \\text{ mol}$.\\n2. Thermal decomposition of $0.0125 \\text{ mol}$ of $\\text{A}$ produces $0.0375 \\text{ mol}$ of total gaseous products (a 1:3 molar ratio).\\n3. When water is absorbed, $0.0125 \\text{ mol}$ of non-water gas remains (a 1:1 molar ratio of dry gas to initial $\\text{A}$), meaning $0.0375 - 0.0125 = 0.0250 \\text{ mol}$ of water vapor was produced (a 1:2 ratio of $\\text{H}_2\\text{O}$ to initial $\\text{A}$).\\n4. This yields a stoichiometry where 1 mole of $\\text{A}$ decomposes to form 1 mole of a nitrogen/oxygen-containing gas and 2 moles of $\\text{H}_2\\text{O}(g)$.\\n5. Since the molar mass of $\\text{A}$ is $80.0 \\text{ g/mol}$ and it contains only H, N, and O, the formula matches ammonium nitrate, $\\text{NH}_4\\text{NO}_3$ ($M = 80.04 \\text{ g/mol}$).\\n6. The thermal decomposition equation at $230 \\ ^\\circ\\text{C}$ is:\\n$$\\text{NH}_4\\text{NO}_3(s) \\rightarrow \\text{N}_2\\text{O}(g) + 2\\text{H}_2\\text{O}(g)$$\\nThis matches the observed 1:3 total gas ratio and 1:2 water vapor ratio perfectly.\\n\\ne. Lewis structures (using bracket SMILES notation for structures or standard chemical descriptions):\\n- **Cation** $\\text{NH}_4^+$: Central $\\text{N}$ atom single-bonded to four $\\text{H}$ atoms in a tetrahedral geometry (formal charge on $\\text{N}$ is +1). SMILES: '[NH4+]'\\n- **Anion** $\\text{NO}_3^-$: Central $\\text{N}$ atom single-bonded to two $\\text{O}$ atoms (formal charge -1 each) and double-bonded to one $\\text{O}$ atom (formal charge 0). The central $\\text{N}$ has a formal charge of +1. There are three major resonance structures, showing the double bond delocalized over all three oxygen atoms. SMILES: '[O-]N(=O)[O-]'\\n- **Decomposition Products**:\\n  - $\\text{N}_2\\text{O}$: Linear structure with two major resonance contributors:\\n    1. $\\text{:N}\\equiv\\text{N}-\\ddot{\\text{O}}\\text{:}^-$ (terminal $\\text{N}$ formal charge 0, central $\\text{N}$ formal charge +1, terminal $\\text{O}$ formal charge -1). SMILES: 'N#[N+][O-]'\\n    2. $^-\\text{:}\\ddot{\\text{N}}=\\text{N}=\\ddot{\\text{O}}\\text{:}$ (terminal $\\text{N}$ formal charge -1, central $\\text{N}$ formal charge +1, terminal $\\text{O}$ formal charge 0). SMILES: '[N-]=[N+]=O'\\n  - $\\text{H}_2\\text{O}$: Bent structure with central $\\text{O}$ single-bonded to two $\\text{H}$ atoms and holding two lone pairs. SMILES: '[OH2]'"
}

USNCO Question Example 5:
{
  "qtype": "free_response",
  "reactants": "",
  "reagents": "",
  "conditions": "",
  "answer": "",
  "instructions": "Write net equations for each of the reactions below. Use appropriate ionic and molecular formulas and omit formulas for all ions or molecules that do not take part in a reaction. Write structural formulas for all organic substances, and clearly show stereochemistry where relevant. You need not balance the equations or show the phase of the species.\\n\\na. Aqueous hydrochloric acid is added to a solution of sodium hypochlorite.\\n\\nb. Aluminum foil is added to concentrated aqueous potassium hydroxide solution.\\n\\nc. Metallic sodium is added to liquid ammonia in the presence of a trace amount of iron(III) nitrate.\\n\\nd. Potassium tetrachloroplatinate is heated with two equivalents of aqueous ammonia.\\n\\ne. Sodium tert-butoxide is added to 3-bromo-3-ethylpentane in N,N-dimethylformamide (DMF) solution.\\n\\nf. Cobalt-57 undergoes radioactive decay by electron capture.",
  "hint": "Analyze each system: (a) redox/comproportionation of chlorine species, (b) amphoteric aluminum reaction in strong base, (c) catalytic synthesis of sodium amide, (d) ligand substitution showing trans effect, (e) E2 elimination with a bulky base, (f) nuclear reaction for electron capture.",
  "explanation": "a. Adding aqueous hydrochloric acid to a solution of sodium hypochlorite results in protonation of the hypochlorite ion. Under acidic conditions, the hypochlorous acid can react with chloride ions to undergo compropoportionation, forming chlorine gas:\\n$$\\text{H}^+(aq) + \\text{ClO}^-(aq) \\rightarrow \\text{HClO}(aq)$$\\nAnd/or the compropoportionation to chlorine gas:\\n$$\\text{ClO}^-(aq) + \\text{Cl}^-(aq) + 2\\text{H}^+(aq) \\rightarrow \\text{Cl}_2(g) + \\text{H}_2\\text{O}(l)$$\\nBoth are correct net chemical representations depending on concentration.\\n\\nb. Aluminum is an amphoteric metal that dissolves in strongly basic solutions to form tetrahydroxoaluminate(III) complex and hydrogen gas:\\n$$\\text{Al}(s) + \\text{OH}^-(aq) + 3\\text{H}_2\\text{O}(l) \\rightarrow [\\text{Al}(OH)_4]^-(aq) + \\frac{3}{2}\\text{H}_2(g)$$\\n\\nc. In liquid ammonia, sodium metal normally dissolves to form solvated electrons. However, in the presence of a catalytic transition metal like iron(III) (provided as iron(III) nitrate), sodium reacts with ammonia to produce sodium amide and hydrogen gas:\\n$$\\text{Na}(s) + \\text{NH}_3(l) \\xrightarrow{\\text{Fe}^{3+}} \\text{NaNH}_2(s) + \\frac{1}{2}\\text{H}_2(g)$$\\nNet ionic equation:\\n$$\\text{Na} + \\text{NH}_3 \\rightarrow \\text{Na}^+ + \\text{NH}_2^- + \\text{H}_2$$\\n\\nd. Tetrachloroplatinate reacts with two equivalents of ammonia via ligand substitution. Due to the strong trans-directing effect of chloride compared to ammonia, the second ammonia ligand replaces the chloride trans to the first chloride, selectively forming the *cis* isomer (cisplatin):\\n$$\\text{[PtCl_4]}^{2-}(aq) + 2\\text{NH}_3(aq) \\rightarrow \\text{cis-Pt(NH}_3)_2\\text{Cl}_2(s) + 2\\text{Cl}^-(aq)$$\\n\\ne. Sodium tert-butoxide is a strong, sterically hindered base. When added to 3-bromo-3-ethylpentane (a tertiary alkyl halide) in a polar aprotic solvent like DMF, an E2 elimination occurs, forming 3-ethylpent-2-ene:\\nReaction SMILES representation:\\n'CCC(Br)(CC)CC.CC(C)(C)[O-]>>CCC(=CC)CC.CC(C)(C)O.[Br-]' (representing 3-bromo-3-ethylpentane and tert-butoxide reacting to yield 3-ethylpent-2-ene, tert-butanol, and bromide).\\n\\nf. Cobalt-57 decays by electron capture. An inner-shell electron is captured by the nucleus, converting a proton into a neutron and releasing an electron neutrino, yielding iron-57:\\n$$^{57}_{27}\\text{Co} + \\text{e}^- \\rightarrow ^{57}_{26}\\text{Fe} + \\nu_e$$"
}

IChO Question Example 6:
{
  "qtype": "free_response",
  "reactants": "",
  "reagents": "",
  "conditions": "",
  "answer": "",
  "instructions": "A British artist Roger Hiorns entirely filled an apartment with a supersaturated copper sulfate solution, forming brilliant blue crystals of a solid hydrate on the walls, floor, and ceiling.\\n\\na. Write the chemical formula of these blue crystals.\\n\\nb. If the humidity in the apartment is maintained at a constant level, use the Clausius-Clapeyron equation to calculate the temperature (in $^\\circ\\text{C}$) at which the relative humidity will be exactly $35\\%$. Assume the relative humidity is governed by the dehydration equilibrium:\\n$$\\ce{CuSO4*5H2O(s) <=> CuSO4*3H2O(s) + 2H2O(g)}$$\\n\\nc. Rectification of aqueous ethanol at atmospheric pressure can increase its concentration to not more than $95.5\\%\\text{ wt.}$. Deduce the thermodynamic basis for this limit.\\n\\nd. Anhydrous copper sulfate is used to dehydrate ethanol further by treating it in sequential portions until it stops turning blue. Calculate the minimum residual water content (in mass percent) in ethanol that can be achieved at room temperature ($298.15\\text{ K}$) using this method.\\n\\ne. Determine the minimum residual water contents (in mass percent) if ethanol is dried using this method at $0\\ ^\\circ\\text{C}$ and $40\\ ^\\circ\\text{C}$ respectively, and explain which temperature is preferred.\\n\\n**Thermodynamic Data (at 298 K):**\\n- $\\Delta_f H^\\circ\\ce{[CuSO4*5H2O(s)]} = -2277.4\\text{ kJ mol}^{-1}$\\n- $\\Delta_f H^\\circ\\ce{[CuSO4*3H2O(s)]} = -1688.7\\text{ kJ mol}^{-1}$\\n- $\\Delta_f H^\\circ\\ce{[CuSO4*H2O(s)]} = -1084.4\\text{ kJ mol}^{-1}$\\n- $\\Delta_f H^\\circ\\ce{[CuSO4(s)]} = -770.4\\text{ kJ mol}^{-1}$\\n- $\\Delta_f H^\\circ\\ce{[H2O(l)]} = -285.83\\text{ kJ mol}^{-1}$\\n- $\\Delta_f H^\\circ\\ce{[H2O(g)]} = -241.83\\text{ kJ mol}^{-1}$\\n- $p_{sat}\\text{ of pure water} = 3200\\text{ Pa}$\\n- $p_{sat}\\text{ over } \\ce{CuSO4*5H2O} = 1047\\text{ Pa}$\\n- $p_{sat}\\text{ over } \\ce{CuSO4*H2O} = 107\\text{ Pa}$\\n\\n*Note: Vapor pressure of water over a dilute solution in ethanol is given by $p = p_{sat} \\gamma x$, where $x$ is the mole fraction of water, and $\\gamma$ is the activity coefficient of water, which is approximately $2.45$ and is independent of temperature.*",
  "hint": "Use the formation enthalpies to find the reaction enthalpy for dehydration. Apply the Clausius-Clapeyron equation to find the temperature for relative humidity. For drying ethanol, use the water vapor pressure over the monohydrate-anhydrous equilibrium.",
  "explanation": "a. The blue crystals are copper(II) sulfate pentahydrate: $\\ce{CuSO4*5H2O}$.\\n\\nb. For the dehydration equilibrium:\\n$$\\ce{CuSO4*5H2O(s) <=> CuSO4*3H2O(s) + 2H2O(g)}$$\\n$\\Delta_{dec} H^\\circ = \\Delta_f H^\\circ(\\ce{CuSO4*3H2O}) + 2\\Delta_f H^\\circ(\\ce{H2O(g)}) - \\Delta_f H^\\circ(\\ce{CuSO4*5H2O})$$\\n$$\\Delta_{dec} H^\\circ = -1688.7 + 2(-241.83) - (-2277.4) = +105.04\\text{ kJ mol}^{-1}$$\\nThis reaction produces $2$ moles of water vapor, so the enthalpy of dehydration per mole of water vapor is $\\Delta H_{dec} = 52.52\\text{ kJ mol}^{-1}$.\\n\\nApplying the Clausius-Clapeyron equation for the water vapor pressure over the hydrate $p_h(T)$ and saturated water vapor pressure $p_{sat}(T)$:\\n$$\\ln \\frac{p_h(T)}{p_{h0}} = -\\frac{\\Delta H_{dec}}{R} \\left( \\frac{1}{T} - \\frac{1}{T_0} \\right)$$\\n$$\\ln \\frac{p_{sat}(T)}{p_{sat0}} = -\\frac{\\Delta H_{vap}}{R} \\left( \\frac{1}{T} - \\frac{1}{T_0} \\right)$$\\nwhere $\\Delta H_{vap} = \\Delta_f H^\\circ(\\ce{H2O(g)}) - \\Delta_f H^\\circ(\\ce{H2O(l)}) = -241.83 - (-285.83) = 44.00\\text{ kJ mol}^{-1}$.\\n\\nSetting the relative humidity to $35\\%$, we have $p_h(T) / p_{sat}(T) = 0.35$:\\n$$\\ln \\left( \\frac{p_h(T)}{p_{sat}(T)} \\right) = \\ln \\left( \\frac{p_{h0}}{p_{sat0}} \\right) - \\frac{\\Delta H_{dec} - \\Delta H_{vap}}{R} \\left( \\frac{1}{T} - \\frac{1}{298.15} \\right)$$\\n$$\\ln(0.35) = \\ln \\left( \\frac{1047}{3200} \\right) - \\frac{52520 - 44000}{8.314} \\left( \\frac{1}{T} - \\frac{1}{298.15} \\right)$$\\n$$-1.0498 = -1.1171 - 1024.78 \\left( \\frac{1}{T} - \\frac{1}{298.15} \\right)$$\\n$$\\frac{1}{T} - \\frac{1}{298.15} = -6.567 \\times 10^{-5}\\text{ K}^{-1} \\Rightarrow T = 304.1\\text{ K} \\approx 31\\ ^\\circ\\text{C}$$\\n\\nc. Rectification limit is due to the formation of a minimum-boiling azeotrope (at $95.5\\%\\text{ wt.}$) where the mole fractions of water and ethanol in the gas and liquid phases at equilibrium are equal ($y_i = x_i$).\\n\\nd. Anhydrous copper sulfate acts as a desiccant by forming lower hydrates. In sequential batch dehydrations, the final desiccant phase is in equilibrium with the monohydrate:\\n$$\\ce{CuSO4*H2O(s) <=> CuSO4(s) + H2O(g)}$$\\nThe vapor pressure of water over this system at $298.15\\text{ K}$ is $p_h = 107\\text{ Pa}$.\\nAt equilibrium: $p = p_{sat} \\gamma x = p_h$\\n$$107 = 3200 \\times 2.45 \\times x \\Rightarrow x = 0.01365$$\\nConverting the mole fraction $x$ to mass percent:\\n$$\\text{wt.}\\%\% = \\frac{x \\times 18.015}{x \\times 18.015 + (1 - x) \\times 46.07} \\times 100 \\approx 0.54\\%\\text{ wt.}$$\\n\\ne. The enthalpy of dehydration of the monohydrate is:\\n$$\\Delta H_{dec,mono} = \\Delta_f H^\\circ(\\ce{CuSO4}) + \\Delta_f H^\\circ(\\ce{H2O(g)}) - \\Delta_f H^\\circ(\\ce{CuSO4*H2O}) = -770.4 - 241.83 - (-1084.4) = +72.17\\text{ kJ mol}^{-1}$$\\n\\nUsing the Clausius-Clapeyron equation for $x(T)$:\\n$$x(T) = x_{298} \\exp \\left[ -\\frac{\\Delta H_{dec,mono} - \\Delta H_{vap}}{R} \\left( \\frac{1}{T} - \\frac{1}{298.15} \\right) \\right]$$\\n$$x(T) = 0.01365 \\exp \\left[ -\\frac{28170}{8.314} \\left( \\frac{1}{T} - \\frac{1}{298.15} \\right) \\right]$$\\n\\n- At $0\\ ^\\circ\\text{C}$ ($T = 273.15\\text{ K}$):\\n  $x = 0.00482 \\Rightarrow \\text{wt.}\\%\% \\approx 0.19\\%\\text{ wt.}$\\n- At $40\\ ^\\circ\\text{C}$ ($T = 313.15\\text{ K}$):\\n  $x = 0.02352 \\Rightarrow \\text{wt.}\\%\% \\approx 0.93\\%\\text{ wt.}$\\n\\nPerforming the dehydration at a lower temperature ($0\\ ^\\circ\\text{C}$) is preferred because the hydration reaction ($\\Delta H_{hyd} = -72.17\\text{ kJ mol}^{-1}$) is highly exothermic, which shifts the equilibrium to the reactant (hydrated) side at lower temperatures, achieving a lower residual water content."
}

IChO Question Example 7:
{
  "qtype": "free_response",
  "reactants": "",
  "reagents": "",
  "conditions": "",
  "answer": "",
  "instructions": "Turnover frequency (TOF) and turnover number (TON) are crucial kinetic indicators of a catalyst\\'s performance. Under IUPAC definitions, TOF is the maximum number of reagent molecules a catalytic site can convert per unit time, while TON is the total number of moles of reagent converted per mole of catalyst before inactivation.\\n\\na. State the SI unit of TOF and write the thermodynamic/kinetic relation between TON, TOF, and the time until inactivation ($t$).\\n\\nb. A gas-phase reaction $\\ce{A + Cat -> B}$ proceeds on a solid catalyst surface in a closed system. The amount of product $B$ produced per $\\text{cm}^2$ of a catalytic surface with $10^{15}\\text{ sites cm}^{-2}$ as a function of time is plotted below:\\n\\n[[SVG: <svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 400 300\\' width=\\'400\\' height=\\'300\\'>\\n  <rect width=\\'100%\\' height=\\'100%\\' fill=\\'white\\'/>\\n  <line x1=\\'40\\' y1=\\'280\\' x2=\\'380\\' y2=\\'280\\' stroke=\\'black\\' stroke-width=\\'2\\' fill=\\'none\\'/>\\n  <line x1=\\'40\\' y1=\\'280\\' x2=\\'40\\' y2=\\'20\\' stroke=\\'black\\' stroke-width=\\'2\\' fill=\\'none\\'/>\\n  <polygon points=\\'380,277 385,280 380,283\\' fill=\\'black\\'/>\\n  <polygon points=\\'37,20 40,15 43,20\\' fill=\\'black\\'/>\\n  <text x=\\'50\\' y=\\'30\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>N_B, mol/cm² • 10^8</text>\\n  <text x=\\'360\\' y=\\'295\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>t, s</text>\\n  <line x1=\\'35\\' y1=\\'230\\' x2=\\'40\\' y2=\\'230\\' stroke=\\'black\\' stroke-width=\\'1\\' fill=\\'none\\'/><text x=\\'15\\' y=\\'234\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>1</text>\\n  <line x1=\\'35\\' y1=\\'180\\' x2=\\'40\\' y2=\\'180\\' stroke=\\'black\\' stroke-width=\\'1\\' fill=\\'none\\'/><text x=\\'15\\' y=\\'184\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>5</text>\\n  <line x1=\\'35\\' y1=\\'130\\' x2=\\'40\\' y2=\\'130\\' stroke=\\'black\\' stroke-width=\\'1\\' fill=\\'none\\'/><text x=\\'15\\' y=\\'134\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>9</text>\\n  <line x1=\\'35\\' y1=\\'80\\' x2=\\'40\\' y2=\\'80\\' stroke=\\'black\\' stroke-width=\\'1\\' fill=\\'none\\'/><text x=\\'15\\' y=\\'84\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>13</text>\\n  <line x1=\\'90\\' y1=\\'280\\' x2=\\'90\\' y2=\\'285\\' stroke=\\'black\\' stroke-width=\\'1\\' fill=\\'none\\'/><text x=\\'86\\' y=\\'295\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>2</text>\\n  <text x=\\'136\\' y=\\'295\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>4</text>\\n  <path d=\\'M40,280 Q100,80 300,70\\' fill=\\'none\\' stroke=\\'black\\' stroke-width=\\'2\\'/>\\n</svg>]]\\n\\nEstimate the TOF (in $\\text{s}^{-1}$) of the catalyst from this plot.\\n\\nc. The kinetics of the same reaction are evaluated at different initial pressures of reagent $A$ (indicated by the red labels on the curves below):\\n\\n[[SVG: <svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 400 300\\' width=\\'400\\' height=\\'300\\'>\\n  <rect width=\\'100%\\' height=\\'100%\\' fill=\\'white\\'/>\\n  <line x1=\\'40\\' y1=\\'280\\' x2=\\'380\\' y2=\\'280\\' stroke=\\'black\\' stroke-width=\\'2\\' fill=\\'none\\'/>\\n  <line x1=\\'40\\' y1=\\'280\\' x2=\\'40\\' y2=\\'20\\' stroke=\\'black\\' stroke-width=\\'2\\' fill=\\'none\\'/>\\n  <polygon points=\\'380,277 385,280 380,283\\' fill=\\'black\\'/>\\n  <polygon points=\\'37,20 40,15 43,20\\' fill=\\'black\\'/>\\n  <text x=\\'50\\' y=\\'30\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>N_B, mol/cm² • 10^7</text>\\n  <text x=\\'360\\' y=\\'295\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>t, s</text>\\n  <line x1=\\'35\\' y1=\\'230\\' x2=\\'40\\' y2=\\'230\\' stroke=\\'black\\' stroke-width=\\'1\\' fill=\\'none\\'/><text x=\\'15\\' y=\\'234\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>1</text>\\n  <line x1=\\'35\\' y1=\\'180\\' x2=\\'40\\' y2=\\'180\\' stroke=\\'black\\' stroke-width=\\'1\\' fill=\\'none\\'/><text x=\\'15\\' y=\\'184\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>5</text>\\n  <line x1=\\'35\\' y1=\\'130\\' x2=\\'40\\' y2=\\'130\\' stroke=\\'black\\' stroke-width=\\'1\\' fill=\\'none\\'/><text x=\\'15\\' y=\\'134\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>9</text>\\n  <line x1=\\'35\\' y1=\\'80\\' x2=\\'40\\' y2=\\'80\\' stroke=\\'black\\' stroke-width=\\'1\\' fill=\\'none\\'/><text x=\\'15\\' y=\\'84\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>13</text>\\n  <line x1=\\'90\\' y1=\\'280\\' x2=\\'90\\' y2=\\'285\\' stroke=\\'black\\' stroke-width=\\'1\\' fill=\\'none\\'/><text x=\\'86\\' y=\\'295\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>2</text>\\n  <line x1=\\'140\\' y1=\\'280\\' x2=\\'140\\' y2=\\'285\\' stroke=\\'black\\' stroke-width=\\'1\\' fill=\\'none\\'/><text x=\\'136\\' y=\\'295\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>4</text>\\n  <path d=\\'M40,280 Q90,90 280,80\\' fill=\\'none\\' stroke=\\'black\\' stroke-width=\\'2\\'/>\\n  <text x=\\'290\\' y=\\'85\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'red\\'>11</text>\\n  <path d=\\'M40,280 Q90,100 270,100\\' fill=\\'none\\' stroke=\\'darkgreen\\' stroke-width=\\'2\\'/>\\n  <text x=\\'280\\' y=\\'105\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'red\\'>10</text>\\n  <path d=\\'M40,280 Q80,180 230,170\\' fill=\\'none\\' stroke=\\'darkblue\\' stroke-width=\\'2\\'/>\\n  <text x=\\'240\\' y=\\'175\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'red\\'>3</text>\\n  <path d=\\'M40,280 Q80,220 220,220\\' fill=\\'none\\' stroke=\\'purple\\' stroke-width=\\'2\\'/>\\n  <text x=\\'230\\' y=\\'225\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'red\\'>1</text>\\n</svg>]]\\n\\nAssuming $10^{15}\\text{ sites cm}^{-2}$, calculate TOF. If this catalyst is run under maximum efficiency for exactly $40$ minutes before becoming completely inactivated, estimate its TON.\\n\\nd. Under Kobozev\\'s active ensemble theory, active catalytic sites consist of clusters of $n_1$ deposited metal atoms on an inert surface. The reaction rate $N_B$ as a function of deposited metal atoms $N_{Cat}$ is shown in two cases below. In Figure 2a, every deposited atom acts as an active site. Calculate TOF for this case:\\n\\n[[SVG: <svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 400 300\\' width=\\'400\\' height=\\'300\\'>\\n  <rect width=\\'100%\\' height=\\'100%\\' fill=\\'white\\'/>\\n  <line x1=\\'40\\' y1=\\'280\\' x2=\\'380\\' y2=\\'280\\' stroke=\\'black\\' stroke-width=\\'2\\' fill=\\'none\\'/>\\n  <line x1=\\'40\\' y1=\\'280\\' x2=\\'40\\' y2=\\'20\\' stroke=\\'black\\' stroke-width=\\'2\\' fill=\\'none\\'/>\\n  <polygon points=\\'380,277 385,280 380,283\\' fill=\\'black\\'/>\\n  <polygon points=\\'37,20 40,15 43,20\\' fill=\\'black\\'/>\\n  <text x=\\'50\\' y=\\'30\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>N_B, mol/s/cm² • 10^11</text>\\n  <text x=\\'240\\' y=\\'295\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>N_Cat, molecules/cm² • 10^12</text>\\n  <line x1=\\'40\\' y1=\\'280\\' x2=\\'320\\' y2=\\'80\\' stroke=\\'purple\\' stroke-width=\\'2\\' fill=\\'none\\'/>\\n  <circle cx=\\'80\\' cy=\\'250\\' r=\\'4\\' fill=\\'purple\\'/>\\n  <circle cx=\\'120\\' cy=\\'220\\' r=\\'4\\' fill=\\'purple\\'/>\\n  <circle cx=\\'180\\' cy=\\'180\\' r=\\'4\\' fill=\\'purple\\'/>\\n  <circle cx=\\'220\\' cy=\\'150\\' r=\\'4\\' fill=\\'purple\\'/>\\n  <circle cx=\\'280\\' cy=\\'110\\' r=\\'4\\' fill=\\'purple\\'/>\\n  <line x1=\\'35\\' y1=\\'180\\' x2=\\'40\\' y2=\\'180\\' stroke=\\'black\\' stroke-width=\\'1\\' fill=\\'none\\'/><text x=\\'15\\' y=\\'184\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>6</text>\\n  <line x1=\\'35\\' y1=\\'230\\' x2=\\'40\\' y2=\\'230\\' stroke=\\'black\\' stroke-width=\\'1\\' fill=\\'none\\'/><text x=\\'15\\' y=\\'234\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>2</text>\\n  <line x1=\\'120\\' y1=\\'280\\' x2=\\'120\\' y2=\\'285\\' stroke=\\'black\\' stroke-width=\\'1\\' fill=\\'none\\'/><text x=\\'116\\' y=\\'295\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>3</text>\\n</svg>]]\\n\\nIn Figure 2b, the reaction rate peaks due to the statistical ensemble formation of $n_1$-atom sites. Deduce $n_1$ from the curve using the peak parameters ($N_{Cat} = 7 \\times 10^{12}\\text{ molecules cm}^{-2}$, $\\text{Rate} = 18 \\times 10^{11}\\text{ molecules s}^{-1}\\text{ cm}^{-2}$, $\\text{TOF} = 35\\text{ s}^{-1}$):\\n\\n[[SVG: <svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 400 300\\' width=\\'400\\' height=\\'300\\'>\\n  <rect width=\\'100%\\' height=\\'100%\\' fill=\\'white\\'/>\\n  <line x1=\\'40\\' y1=\\'280\\' x2=\\'380\\' y2=\\'280\\' stroke=\\'black\\' stroke-width=\\'2\\' fill=\\'none\\'/>\\n  <line x1=\\'40\\' y1=\\'280\\' x2=\\'40\\' y2=\\'20\\' stroke=\\'black\\' stroke-width=\\'2\\' fill=\\'none\\'/>\\n  <polygon points=\\'380,277 385,280 380,283\\' fill=\\'black\\'/>\\n  <polygon points=\\'37,20 40,15 43,20\\' fill=\\'black\\'/>\\n  <text x=\\'50\\' y=\\'30\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>N_B, mole/s/cm² • 10^11</text>\\n  <text x=\\'240\\' y=\\'295\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>N_Cat, molecules/cm² • 10^12</text>\\n  <path d=\\'M40,200 Q100,200 130,190 T160,80 T190,160 T220,210 T360,210\\' fill=\\'none\\' stroke=\\'purple\\' stroke-width=\\'2\\'/>\\n  <circle cx=\\'60\\' cy=\\'195\\' r=\\'4\\' fill=\\'purple\\'/>\\n  <circle cx=\\'110\\' cy=\\'210\\' r=\\'4\\' fill=\\'purple\\'/>\\n  <circle cx=\\'130\\' cy=\\'150\\' r=\\'4\\' fill=\\'purple\\'/>\\n  <circle cx=\\'160\\' cy=\\'80\\' r=\\'4\\' fill=\\'purple\\'/>\\n  <circle cx=\\'190\\' cy=\\'160\\' r=\\'4\\' fill=\\'purple\\'/>\\n  <circle cx=\\'280\\' cy=\\'210\\' r=\\'4\\' fill=\\'purple\\'/>\\n  <text x=\\'180\\' y=\\'60\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>TOF = 35</text>\\n  <line x1=\\'35\\' y1=\\'80\\' x2=\\'40\\' y2=\\'80\\' stroke=\\'black\\' stroke-width=\\'1\\' fill=\\'none\\'/><text x=\\'15\\' y=\\'84\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>18</text>\\n  <line x1=\\'160\\' y1=\\'280\\' x2=\\'160\\' y2=\\'285\\' stroke=\\'black\\' stroke-width=\\'1\\' fill=\\'none\\'/><text x=\\'156\\' y=\\'295\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>7</text>\\n</svg>]]\\n\\ne. Deposition of Au on $Mo-TiO_2$ forms active CO oxidation catalysts. The bilayer structure (Fig. 3a) yields a rate of $r_1$, while the monolayer (Fig. 3b) yields $r_2 = \\frac{1}{4}r_1$:\\n\\n[[SVG: <svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 400 300\\' width=\\'400\\' height=\\'300\\'>\\n  <rect width=\\'100%\\' height=\\'100%\\' fill=\\'white\\'/>\\n  <text x=\\'20\\' y=\\'20\\' font-family=\\'sans-serif\\' font-size=\\'14\\' font-weight=\\'bold\\' fill=\\'black\\'>a) (1x3)</text>\\n  <circle cx=\\'50\\' cy=\\'80\\' r=\\'12\\' fill=\\'lightblue\\' stroke=\\'darkblue\\' stroke-width=\\'1\\'/>\\n  <circle cx=\\'75\\' cy=\\'80\\' r=\\'12\\' fill=\\'lightblue\\' stroke=\\'darkblue\\' stroke-width=\\'1\\'/>\\n  <circle cx=\\'100\\' cy=\\'80\\' r=\\'12\\' fill=\\'lightblue\\' stroke=\\'darkblue\\' stroke-width=\\'1\\'/>\\n  <circle cx=\\'40\\' cy=\\'60\\' r=\\'10\\' fill=\\'yellow\\' stroke=\\'olive\\' stroke-width=\\'1\\'/>\\n  <circle cx=\\'60\\' cy=\\'45\\' r=\\'10\\' fill=\\'red\\' stroke=\\'darkred\\' stroke-width=\\'1\\'/>\\n  <circle cx=\\'80\\' cy=\\'60\\' r=\\'10\\' fill=\\'yellow\\' stroke=\\'olive\\' stroke-width=\\'1\\'/>\\n  <text x=\\'20\\' y=\\'160\\' font-family=\\'sans-serif\\' font-size=\\'14\\' font-weight=\\'bold\\' fill=\\'black\\'>b) (1x1)</text>\\n  <circle cx=\\'50\\' cy=\\'220\\' r=\\'12\\' fill=\\'lightblue\\' stroke=\\'darkblue\\' stroke-width=\\'1\\'/>\\n  <circle cx=\\'75\\' cy=\\'220\\' r=\\'12\\' fill=\\'lightblue\\' stroke=\\'darkblue\\' stroke-width=\\'1\\'/>\\n  <circle cx=\\'100\\' cy=\\'220\\' r=\\'12\\' fill=\\'lightblue\\' stroke=\\'darkblue\\' stroke-width=\\'1\\'/>\\n  <circle cx=\\'50\\' cy=\\'200\\' r=\\'10\\' fill=\\'yellow\\' stroke=\\'olive\\' stroke-width=\\'1\\'/>\\n  <circle cx=\\'75\\' cy=\\'200\\' r=\\'10\\' fill=\\'yellow\\' stroke=\\'olive\\' stroke-width=\\'1\\'/>\\n  <circle cx=\\'100\\' cy=\\'200\\' r=\\'10\\' fill=\\'yellow\\' stroke=\\'olive\\' stroke-width=\\'1\\'/>\\n</svg>]]\\n\\nIf all yellow spheres have identical rates when accessible but zero when blocked (covered by upper layers), and every red atom is fully active in the bilayer structure, calculate the ratio of the TOF for the upper layer red atoms to the TOF of the monolayer yellow atoms.",
  "hint": "Relate TOF to the slope of product formation versus active sites. Use Kobozev\\'s active ensemble theory equations and analyze geometric site accessibility for the Au catalysts.",
  "explanation": "a. The unit of TOF is $\\text{time}^{-1}$, and the SI unit is $\\text{s}^{-1}$. The upper bound relation is given by:\\n$$\\text{TON} \\leq \\text{TOF} \\times t$$\\nIf activity drops gradually over time, then:\\n$$\\text{TON} = \\int_{0}^{t} \\text{TOF}(t^{\\prime}) \\text{ d}t^{\\prime} \\leq \\text{TOF}_{\\text{max}} \\times t$$\\n\\nb. From Figure 1a, the initial slope of the curve is:\\n$$\\frac{\\Delta N_B}{\\Delta t} = \\tan \\alpha = \\frac{7}{2} \\times 10^{-8}\\text{ mol cm}^{-2}\\text{ s}^{-1} = 3.5 \\times 10^{-8}\\text{ mol cm}^{-2}\\text{ s}^{-1}$$\\nConverting moles to molecules:\\n$$\\text{Rate} = 3.5 \\times 10^{-8} \\times 6.022 \\times 10^{23} = 2.108 \\times 10^{16}\\text{ molecules cm}^{-2}\\text{ s}^{-1}$$\\nSince there are $10^{15}\\text{ sites cm}^{-2}$:\\n$$\\text{TOF} = \\frac{\\text{Rate}}{\\text{Sites}} = \\frac{2.108 \\times 10^{16}}{10^{15}} \\approx 21\\text{ s}^{-1}$$\\n\\nc. In Fig 1b, under saturated reagent pressures (reagent pressure $\\geq 10$), the rate achieves a plateau independent of initial pressure. The maximum slope yields identical performance to case (b), so $\\text{TOF} \\approx 21\\text{ s}^{-1}$.\\nFor $t = 40\\text{ minutes} = 2400\\text{ s}$:\\n$$\\text{TON} = \\text{TOF} \\times t = 21\\text{ s}^{-1} \\times 2400\\text{ s} \\approx 5.0 \\times 10^4$$\\n\\nd. In Fig 2a, at $N_{Cat} = 3 \\times 10^{12}\\text{ molecules cm}^{-2}$ the rate is $N_B = 2 \\times 10^{11}\\text{ molecules s}^{-1}\\text{ cm}^{-2}$. Since every atom is a site:\\n$$\\text{TOF} = \\frac{\\text{Rate}}{N_{Cat}} = \\frac{2 \\times 10^{11}}{3 \\times 10^{12}} \\approx 0.067\\text{ s}^{-1}$$\\n\\nIn Fig 2b, the number of active sites is given by Kobozev ensemble theory. At the peak ($N_{Cat} = 7 \\times 10^{12}$), the rate is $N_B = 18 \\times 10^{11}\\text{ molecules s}^{-1}\\text{ cm}^{-2}$.\\nSince $\\text{TOF} = 35\\text{ s}^{-1}$, the active site concentration is:\\n$$N_{sites} = \\frac{N_B}{\\text{TOF}} = \\frac{18 \\times 10^{11}}{35} \\approx 5.14 \\times 10^{10}\\text{ sites cm}^{-2}$$\\nAt the peak, $n_1$ is the ratio of deposited atoms to active sites:\\n$$n_1 = \\frac{N_{Cat}}{N_{sites}} = \\frac{7 \\times 10^{12}}{5.14 \\times 10^{10}} \\approx 136\\text{ atoms site}^{-1}$$\\n\\ne. In the monolayer (Fig 3b), all $3$ yellow atoms are accessible. The rate is $r_2 = 3 \\times \\text{TOF}_{yel}$.\\nIn the bilayer (Fig 3a), the $1$ red atom is fully active. The $2$ yellow atoms are covered/blocked, meaning $N_{yel, accessible} = 0$.\\nThus, the bilayer rate is entirely due to the red atom: $r_1 = 1 \\times \\text{TOF}_{red}$.\\nGiven $r_2 = \\frac{1}{4}r_1 \\Rightarrow r_1 = 4r_2$, we substitute the rates:\\n$$\\text{TOF}_{red} = 4 \\left( 3 \\times \\text{TOF}_{yel} \\right) = 12 \\times \\text{TOF}_{yel}$$\\nSo the ratio of the TOF of the red upper-layer atoms to that of the monolayer yellow atoms is exactly $12$."
}

IChO Question Example 8:
{
  "qtype": "free_response",
  "reactants": "",
  "reagents": "",
  "conditions": "",
  "answer": "",
  "instructions": "The phase diagram of water at high pressures contains several crystalline polymorphs of ice, as shown in the logarithmic scale plot below:\\n\\n[[SVG: <svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 500 400\\' width=\\'500\\' height=\\'400\\'>\\n  <rect width=\\'100%\\' height=\\'100%\\' fill=\\'white\\'/>\\n  <line x1=\\'60\\' y1=\\'360\\' x2=\\'480\\' y2=\\'360\\' stroke=\\'black\\' stroke-width=\\'2\\' fill=\\'none\\'/>\\n  <line x1=\\'60\\' y1=\\'360\\' x2=\\'60\\' y2=\\'20\\' stroke=\\'black\\' stroke-width=\\'2\\' fill=\\'none\\'/>\\n  <text x=\\'30\\' y=\\'200\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\' text-anchor=\\'middle\\' transform=\\'rotate(-90 30 200)\\'>Pressure p / MPa</text>\\n  <text x=\\'270\\' y=\\'390\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\' text-anchor=\\'middle\\'>Temperature T / K</text>\\n  <text x=\\'50\\' y=\\'30\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\' text-anchor=\\'end\\'>10^4</text>\\n  <text x=\\'50\\' y=\\'110\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\' text-anchor=\\'end\\'>10^2</text>\\n  <text x=\\'50\\' y=\\'190\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\' text-anchor=\\'end\\'>10^0</text>\\n  <text x=\\'50\\' y=\\'270\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\' text-anchor=\\'end\\'>10^-2</text>\\n  <text x=\\'50\\' y=\\'350\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\' text-anchor=\\'end\\'>10^-4</text>\\n  <line x1=\\'60\\' y1=\\'360\\' x2=\\'60\\' y2=\\'365\\' stroke=\\'black\\' stroke-width=\\'1\\'/><text x=\\'60\\' y=\\'380\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\' text-anchor=\\'middle\\'>200</text>\\n  <line x1=\\'120\\' y1=\\'360\\' x2=\\'120\\' y2=\\'365\\' stroke=\\'black\\' stroke-width=\\'1\\'/><text x=\\'120\\' y=\\'380\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\' text-anchor=\\'middle\\'>300</text>\\n  <line x1=\\'180\\' y1=\\'360\\' x2=\\'180\\' y2=\\'365\\' stroke=\\'black\\' stroke-width=\\'1\\'/><text x=\\'180\\' y=\\'380\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\' text-anchor=\\'middle\\'>400</text>\\n  <line x1=\\'240\\' y1=\\'360\\' x2=\\'240\\' y2=\\'365\\' stroke=\\'black\\' stroke-width=\\'1\\'/><text x=\\'240\\' y=\\'380\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\' text-anchor=\\'middle\\'>500</text>\\n  <line x1=\\'300\\' y1=\\'360\\' x2=\\'300\\' y2=\\'365\\' stroke=\\'black\\' stroke-width=\\'1\\'/><text x=\\'300\\' y=\\'380\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\' text-anchor=\\'middle\\'>600</text>\\n  <line x1=\\'360\\' y1=\\'360\\' x2=\\'360\\' y2=\\'365\\' stroke=\\'black\\' stroke-width=\\'1\\'/><text x=\\'360\\' y=\\'380\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\' text-anchor=\\'middle\\'>700</text>\\n  <path d=\\'M120,360 Q150,280 180,270\\' fill=\\'none\\' stroke=\\'black\\' stroke-width=\\'2\\'/>\\n  <path d=\\'M180,270 Q280,180 460,110\\' fill=\\'none\\' stroke=\\'black\\' stroke-width=\\'2\\'/>\\n  <path d=\\'M180,270 Q180,180 160,80\\' fill=\\'none\\' stroke=\\'black\\' stroke-width=\\'2\\'/>\\n  <path d=\\'M160,80 L140,80\\' fill=\\'none\\' stroke=\\'black\\' stroke-width=\\'2\\'/>\\n  <path d=\\'M160,80 L170,60\\' fill=\\'none\\' stroke=\\'black\\' stroke-width=\\'2\\'/>\\n  <path d=\\'M170,60 L190,40\\' fill=\\'none\\' stroke=\\'black\\' stroke-width=\\'2\\'/>\\n  <path d=\\'M190,40 L260,10\\' fill=\\'none\\' stroke=\\'black\\' stroke-width=\\'2\\'/>\\n  <path d=\\'M170,60 L140,40\\' fill=\\'none\\' stroke=\\'black\\' stroke-width=\\'2\\'/>\\n  <path d=\\'M190,40 L160,10\\' fill=\\'none\\' stroke=\\'black\\' stroke-width=\\'2\\'/>\\n  <circle cx=\\'180\\' cy=\\'270\\' r=\\'4\\' fill=\\'black\\'/>\\n  <circle cx=\\'160\\' cy=\\'80\\' r=\\'4\\' fill=\\'black\\'/>\\n  <circle cx=\\'170\\' cy=\\'60\\' r=\\'4\\' fill=\\'black\\'/>\\n  <circle cx=\\'190\\' cy=\\'40\\' r=\\'4\\' fill=\\'black\\'/>\\n  <text x=\\'100\\' y=\\'160\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>Ice I</text>\\n  <text x=\\'110\\' y=\\'70\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>Ice III</text>\\n  <text x=\\'130\\' y=\\'50\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>Ice V</text>\\n  <text x=\\'160\\' y=\\'30\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>Ice VI</text>\\n  <text x=\\'240\\' y=\\'20\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>Ice VII</text>\\n  <text x=\\'280\\' y=\\'140\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>Liquid</text>\\n  <text x=\\'320\\' y=\\'270\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>Vapor</text>\\n</svg>]]\\n\\na. Explain qualitatively how the boiling point of water and the melting points of ordinary ice (Ice I) and Ice V vary with pressure, referencing Le Chatelier\\'s principle.\\n\\nb. Deduce the sequence of phase transitions that occur when water vapor is gradually compressed from $10\\text{ Pa}$ to $10\\text{ GPa}$ at a constant temperature of: (i) $250\\text{ K}$, (ii) $400\\text{ K}$, (iii) $700\\text{ K}$.\\n\\nc. Water, Ice I, and Ice III meet at a triple point at a pressure of $210\\text{ MPa}$. Estimate the temperature at this triple point.\\n\\nd. Assuming the heat of fusion is identical for all forms of ice, determine which of the ice polymorphs is the densest, and estimate its melting point at $10\\text{ GPa}$.\\n\\ne. The densest ice (Ice VII) has a cubic crystal structure with two water molecules per unit cell. The unit cell edge length is $0.335\\text{ nm}$. Calculate the density (in $\\text{g cm}^{-3}$) of Ice VII.\\n\\nf. Estimate the enthalpy of fusion of this densest ice.\\n\\n**Thermodynamic & Physical Data:**\\n- Density of ordinary ice (Ice I) = $0.917\\text{ g cm}^{-3}$\\n- Density of liquid water = $1.000\\text{ g cm}^{-3}$\\n- Enthalpy of fusion of ordinary ice = $+6010\\text{ J mol}^{-1}$\\n- Triple point of $\\ce{Liquid - Ice VI - Ice VII}$: $P = 2200\\text{ MPa}$, $T = 355\\text{ K}$.\\n- *Assume the densities and transition enthalpies do not vary with pressure or temperature.*",
  "hint": "Apply Le Chatelier\\'s principle comparing the volume changes during phase transitions. Use the Clapeyron equation to quantitatively estimate phase boundary slopes and triple point temperatures.",
  "explanation": "a. Applying the Le Chatelier principle to phase transitions:\\n- For boiling ($\\ce{H2O(l) <=> H2O(g)}$), volume increases ($\\Delta V > 0$) and heat is absorbed ($\\Delta H > 0$). An increase in pressure shifts the equilibrium leftwards; thus, the boiling point increases.\\n- For Ice V melting ($\\ce{Ice V <=> Liquid}$), volume decreases ($\\Delta V < 0$) and heat is absorbed ($\\Delta H > 0$). An increase in pressure shifts the equilibrium rightwards; thus, the melting point of Ice V increases with pressure.\\n- For ordinary ice melting ($\\ce{Ice I <=> Liquid}$), liquid water is denser than Ice I, so volume decreases ($\\Delta V < 0$) and heat is absorbed ($\\Delta H > 0$). Increasing pressure shifts the equilibrium to the liquid side; thus, the melting point decreases with pressure.\\n\\nb. Compression paths from $10\\text{ Pa}$ to $10\\text{ GPa}$ ($10^4\\text{ MPa}$):\\n- **At $250\\text{ K}$**: Vapor $\\rightarrow$ Ice I $\\rightarrow$ Ice III $\\rightarrow$ Ice V $\\rightarrow$ Ice VI $\\rightarrow$ Ice VII.\\n- **At $400\\text{ K}$**: Vapor $\\rightarrow$ Liquid $\\rightarrow$ Ice VI $\\rightarrow$ Ice VII.\\n- **At $700\\text{ K}$**: The temperature is above the critical temperature of water ($647\\text{ K}$). It begins as a supercritical fluid/gas and compresses directly into Ice VII.\\n\\nc. The triple point is the intersection of Ice I, Ice III, and liquid water. We can approximate the melting point boundary of Ice I using the Clapeyron equation:\\n$$\\frac{dT}{dP} = \\frac{T \\Delta V}{\\Delta H}$$\\nGiven $\\Delta H_{fus} = +6010\\text{ J mol}^{-1}$:\\n$$\\Delta V = V_l - V_{ice} = 18.015 \\left( \\frac{1}{1.000} - \\frac{1}{0.917} \\right) = -1.632\\text{ cm}^3\\text{ mol}^{-1} = -1.632 \\times 10^{-6}\\text{ m}^3\\text{ mol}^{-1}$$\\nIntegrating from the standard triple point ($T_0 = 273.16\\text{ K}$, $P_0 = 611\\text{ Pa} \\approx 0$):\\n$$\\ln \\left( \\frac{T}{273.16} \\right) = \\frac{\\Delta V}{\\Delta H} \\Delta P = \\frac{-1.632 \\times 10^{-6}}{6010} \\left( 210 \\times 10^6 - 0 \\right) = -0.0570$$\\n$$T = 273.16 \\times e^{-0.0570} \\approx 258\\text{ K}$$\\n\\nd. By the Clapeyron equation, the phase boundary slope $\\frac{dT}{dP} = \\frac{T \\Delta V}{\\Delta H}$ determines the density. Since the melting lines of Ice III, V, VI, and VII all have positive slopes ($dT/dP > 0$), and all forms of ice are assumed to have similar positive heats of fusion ($\\Delta H_{fus} > 0$), we have $\\Delta V = V_l - V_{ice} > 0$, meaning the liquid is less dense than these ice forms. Ice VII exists at the highest pressures and has the steepest positive melting slope, making it the densest form.\\nIntegrating the melting boundary of Ice VII from the $\\ce{Liquid - Ice VI - Ice VII}$ triple point ($T_0 = 355\\text{ K}$, $P_0 = 2200\\text{ MPa}$):\\nWith a density of $1.59\\text{ g cm}^{-3}$ (from part e), the volume change of fusion is:\\n$$\\Delta V = V_l - V_{ice} = 18.015 \\left( \\frac{1}{1.00} - \\frac{1}{1.59} \\right) = 6.68\\text{ cm}^3\\text{ mol}^{-1} = 6.68 \\times 10^{-6}\\text{ m}^3\\text{ mol}^{-1}$$\\n$$\\ln \\left( \\frac{T}{355} \\right) = \\frac{6.68 \\times 10^{-6}}{6010} \\left( 10000 \\times 10^6 - 2200 \\times 10^6 \\right) = 0.867$$\\n$$T = 355 \\times e^{-0.867} \\approx 845\\text{ K}$$\\n\\ne. Density of Ice VII:\\n$$V_{\\text{cell}} = (0.335 \\times 10^{-7}\\text{ cm})^3 = 3.760 \\times 10^{-23}\\text{ cm}^3$$\\n$$\\rho = \\frac{Z \\times M}{N_A \\times V_{\\text{cell}}} = \\frac{2 \\times 18.015}{6.022 \\times 10^{23} \\times 3.760 \\times 10^{-23}} \\approx 1.59\\text{ g cm}^{-3}$$\\n\\nf. By the Clapeyron equation, using $\\Delta V = 6.68 \\times 10^{-6}\\text{ m}^3\\text{ mol}^{-1}$ and the boundary line slope: the enthalpy of fusion remains highly constant at approximately $+6.01\\text{ kJ mol}^{-1}$."
}

IChO Question Example 9:
{
  "qtype": "free_response",
  "reactants": "",
  "reagents": "",
  "conditions": "",
  "answer": "",
  "instructions": "Fluoride ions form a stable complex with aluminum(III):\\n$$\\ce{6 F^- + Al^{3+} <=> [AlF6]^{3-}}$$\\nThis complexation equilibrium forms the basis for direct titration of fluoride and indirect determination of other inorganic ions.\\n\\nIn the first experiment, an aqueous sample solution containing fluoride was neutralized with methyl red indicator, saturated with solid $\\ce{NaCl}$, and heated to $70-80\\ ^\\circ\\text{C}$. The solution was titrated with $0.150\\text{ M } \\ce{AlCl3}$ titrant until the yellow indicator turned pink.\\n\\na. Write the chemical equation representing the process that occurs at the endpoint and explain the role of $\\ce{NaCl}$.\\n\\nb. Explain why heating the titration mixture increases the endpoint sharpness.\\n\\nc. In the second experiment, the concentration of calcium ions in a sample was determined via back-titration. An excess of solid $\\ce{NaCl}$ and exactly $0.500\\text{ g}$ of $\\ce{NaF}$ were added to the sample. The resulting mixture was neutralized and titrated with $0.1000\\text{ M } \\ce{AlCl3}$ in the presence of methyl red. The indicator endpoint was reached with exactly $10.25\\text{ cm}^3$ of titrant. Identify the reactions taking place and calculate the amount (in moles) and mass (in grams) of calcium in the sample.\\n\\nd. Deducing silicic acid content uses similar principles. To a neutralized colloidal solution of silicic acid ($\\ce{Si(OH)4}$), exactly $0.500\\text{ g}$ of $\\ce{KF}$ is added, followed by the addition of exactly $10.00\\text{ cm}^3$ of $0.0994\\text{ M } \\ce{HCl}$. The resulting mixture is titrated with a standard $0.1000\\text{ M } \\ce{NaOH}$ solution in the presence of phenol red indicator, requiring exactly $5.50\\text{ cm}^3$ of the base to reach the endpoint.\\n\\nWrite the balanced chemical equations representing the determination reactions, justify the choice of indicator for the pre-titration neutralization step (among methyl red, $pK_a = 5.1$; phenol red, $pK_a = 8.0$; and thymolphthalein, $pK_a = 9.9$), and calculate the moles of silicic acid in the sample solution.",
  "hint": "For part a, focus on the hydrolysis of excess aluminum(III) at the endpoint. For quantitative parts, write balanced stoichiometry equations and use the added reagents to set up mole equations.",
  "explanation": "a. At the endpoint, the excess $\\ce{Al^{3+}}$ ions undergo hydrolysis, generating hydronium ions that lower the pH and turn the methyl red indicator from yellow to pink:\\n$$\\ce{[Al(H2O)6]^{3+} + H2O <=> [Al(OH)(H2O)5]^{2+} + H3O^+}$$\\nThe addition of solid $\\ce{NaCl}$ shifts the complexation equilibrium forward by precipitating cryolite ($\\ce{Na3AlF6}$), which is only slightly soluble in water:\\n$$\\ce{6 F^- + Al^{3+} + 3Na^+ <=> Na3AlF6(s)}$$\\nThe common ion effect of $\\ce{Na^+}$ dramatically decreases the solubility of cryolite, driving the complexation to completion and increasing the sharpness of the endpoint.\\n\\nb. The hydrolysis of aluminum(III) is an endothermic process. Heating the solution to $70-80\\ ^\\circ\\text{C}$ shifts the hydrolysis equilibrium rightwards, producing more hydronium ions per excess unit of $\\ce{Al^{3+}}$ at the equivalence point, which increases the pH drop and endpoint sharpness.\\n\\nc. In the back-titration of calcium:\\n1. Fluoride precipitates calcium ions quantitatively:\\n$$\\ce{Ca^{2+} + 2F^- -> CaF2(s)}$$\\n2. The excess, unreacted fluoride is titrated with aluminum chloride:\\n$$\\ce{6 F^- + Al^{3+} + 3Na^+ -> Na3AlF6(s)}$$\\n\\nLet\\'s calculate the moles of species:\\n- Total moles of $\\ce{NaF}$ added:\\n$$n(\\ce{F^-})_{\\text{total}} = \\frac{0.500\\text{ g}}{41.99\\text{ g mol}^{-1}} = 0.01191\\text{ mol}$$\\n- Moles of $\\ce{Al^{3+}}$ added at titration endpoint:\\n$$n(\\ce{Al^{3+}}) = 10.25 \\times 10^{-3}\\text{ dm}^3 \\times 0.1000\\text{ mol dm}^{-3} = 0.001025\\text{ mol}$$\\n- Moles of fluoride reacting with aluminum:\\n$$n(\\ce{F^-})_{\\text{complexed}} = 6 \\times n(\\ce{Al^{3+}}) = 6 \\times 0.001025 = 0.006150\\text{ mol}$$\\n- Moles of fluoride precipitated by calcium:\\n$$n(\\ce{F^-})_{\\text{precipitated}} = 0.01191 - 0.006150 = 0.00576\\text{ mol}$$\\n- Moles of calcium in the sample:\\n$$n(\\ce{Ca^{2+}}) = \\frac{1}{2} n(\\ce{F^-})_{\\text{precipitated}} = \\frac{0.00576}{2} = 0.00288\\text{ mol}$$\\n- Mass of calcium in the sample:\\n$$m(\\ce{Ca}) = 0.00288\\text{ mol} \\times 40.08\\text{ g mol}^{-1} \\approx 0.115\\text{ g}$$\\n\\nd. Deducing silicic acid content:\\n1. Silicic acid reacts with fluoride in the presence of acid to form hexafluorosilicate:\\n$$\\ce{Si(OH)4 + 6 F^- + 4 H^+ -> SiF6^{2-} + 4 H2O}$$\\n2. The unreacted hydrochloric acid is back-titrated with sodium hydroxide:\\n$$\\ce{H^+ + OH^- -> H2O}$$\\n\\nLet\\'s calculate the moles of species:\\n- Total moles of $\\ce{HCl}$ added:\\n$$n(\\ce{H^+})_{\\text{total}} = 10.00 \\times 10^{-3}\\text{ dm}^3 \\times 0.0994\\text{ mol dm}^{-3} = 0.000994\\text{ mol}$$\\n- Moles of $\\ce{NaOH}$ titrated at endpoint:\\n$$n(\\ce{OH^-}) = 5.50 \\times 10^{-3}\\text{ dm}^3 \\times 0.1000\\text{ mol dm}^{-3} = 0.000550\\text{ mol}$$\\n- Moles of acid consumed by the silicic acid reaction:\\n$$n(\\ce{H^+})_{\\text{consumed}} = 0.000994 - 0.000550 = 0.000444\\text{ mol}$$\\n- Stoichiometrically, $4$ moles of $\\ce{H^+}$ react per mole of $\\ce{Si(OH)4}$:\\n$$n(\\ce{Si(OH)4}) = \\frac{1}{4} n(\\ce{H^+})_{\\text{consumed}} = \\frac{0.000444}{4} = 0.000111\\text{ mol} = 1.11 \\times 10^{-4}\\text{ mol}$$\\n\\nFor the pre-titration neutralization, phenol red ($pK_a = 8.0$) is the ideal indicator. Silicic acid is an extremely weak acid ($pK_{a1} \\approx 9.9$), meaning it remains fully protonated as $\\ce{Si(OH)4}$ and un-ionized at pH 7-8. Neutralizing with phenol red ensures that all strong acids/bases are neutralized without deprotonating or initiating reaction with the weak silicic acid prior to fluoride addition."
}

Examples of bad questions - what you SHOULD NOT DO:

Bad USNCO question #1
{
"id": "viol_1",
"topic": "Electrochemistry",
"question": "For a hydrogen evolution reaction occurring on a platinum electrode in 1.0 M HCl at 298 K, if the exchange current density $j_0 = 10^{-3} \text{ A cm}^{-2}$ and the transfer coefficient $\alpha = 0.5$, calculate the overpotential $\eta$ required to drive a current density of $j = 0.1 \text{ A cm}^{-2}$ using the Tafel equation. Provide the value in Volts.",
"type": "multiple_choice",
"options": [
"$0.059 \text{ V}$",
"$0.118 \text{ V}$",
"$0.236 \text{ V}$",
"$0.029 \text{ V}$"
],
"answer": "B",
"difficulty": 6,
"detailedSolution": "The Tafel equation is given by $\eta = a + b \log(j)$, where $b = \frac{2.303 RT}{\alpha nF}$. At high overpotentials, $\eta = \frac{2.303 RT}{\alpha nF} \log(\frac{j}{j_0})$. With $n=1$, $R=8.314$, $T=298$, $F=96485$, and $\alpha=0.5$, $b \approx 0.118 \text{ V/decade}$. Thus, $\eta = 0.118 \log(\frac{0.1}{10^{-3}}) = 0.118 \log(100) = 0.118 \times 2 = 0.236 \text{ V}$. *Note: The prompt requires this to be marked at a difficulty level that violates USNCO scope boundaries.*"
},

Problem: Tests content outside the scope of USNCO (tests breadth instead of depth of knowledge).

Bad USNCO question #2:

{
"id": "viol_2",
"topic": "Stoichiometry",
"question": "Calculate the number of moles of sodium chloride in 5.0 grams of the substance. (Molar mass of NaCl = 58.44 g/mol)",
"type": "multiple_choice",
"options": [
"$0.0856 \text{ mol}$",
"$0.100 \text{ mol}$",
"$0.292 \text{ mol}$",
"$11.69 \text{ mol}$"
],
"answer": "A",
"difficulty": 1,
"detailedSolution": "Number of moles = $\text{mass} / \text{molar mass} = 5.0 \text{ g} / 58.44 \text{ g mol}^{-1} \approx 0.08555 \text{ mol}$."
}

Problem: Too simple - can be solved simply by plugging in a formula.

Bad IChO question #3:

{
"id": "viol_3",
"topic": "Materials Chemistry",
"question": "In the context of recently synthesized covalent organic framework (COF) variants, identify the primary structural defect responsible for the anomalous charge carrier mobility observed in $sp^2$-carbon-conjugated 2D-COFs as described in the 2026 JACS report on 'Topological Engineering of Radical-Coupled Frameworks'.",
"type": "multiple_choice",
"options": [
"Stacking fault dislocation",
"Interlayer sliding",
"Radical-induced domain boundary quenching",
"Pore-size polydispersity"
],
"answer": "C",
"difficulty": 9,
"detailedSolution": "The recent research indicates that in $sp^2$-carbon-conjugated COFs, the presence of localized radical sites at the edges of domain boundaries creates traps that quench charge carriers, a phenomenon specific to these high-conductivity topological materials."
}

Problem: Tests research-level knowledge that high school students do not have, and requires knowledge of advanced concepts IChO does not require students to know, without introducing with a first-principles approach.

Bad USNCO question #4:

{
"id": "viol_4",
"topic": "Photochemistry",
"question": "A molecule with a singlet excited state $S_1$ has a fluorescence lifetime of 5.0 ns and a quantum yield of 0.25. Calculate the rate constant of internal conversion $k_{ic}$ assuming that intersystem crossing $k_{isc}$ is negligible.",
"type": "multiple_choice",
"options": [
"$5.0 \times 10^7 \text{ s}^{-1}$",
"$1.5 \times 10^8 \text{ s}^{-1}$",
"$2.0 \times 10^8 \text{ s}^{-1}$",
"$7.5 \times 10^7 \text{ s}^{-1}$"
],
"answer": "B",
"difficulty": 6,
"detailedSolution": "The fluorescence lifetime $\tau = 1 / (k_f + k_{ic} + k_{isc})$. Given $k_{isc} = 0$, $\tau = 1 / (k_f + k_{ic}) = 5.0 \times 10^{-9} \text{ s}$. The quantum yield $\Phi_f = k_f / (k_f + k_{ic}) = k_f \tau = 0.25$. Thus $k_f = 0.25 / 5.0 \times 10^{-9} = 5.0 \times 10^7 \text{ s}^{-1}$. Since $k_f + k_{ic} = 1 / \tau = 2.0 \times 10^8 \text{ s}^{-1}$, then $k_{ic} = 2.0 \times 10^8 - 0.5 \times 10^8 = 1.5 \times 10^8 \text{ s}^{-1}$."
}

Problem: IChO level content in a USNCO level question (outside the scope of USNCO).

Bad IChO question #5:

{
"id": "viol_5",
"topic": "Quantum Dynamics",
"question": "Using the Lindblad master equation in the Markovian approximation, derive the steady-state density matrix $\rho_{ss}$ for a two-level system coupled to a thermal reservoir with a decay rate $\gamma$ and a mean thermal photon number $\bar{n}$.",
"type": "free_response",
"answer": "$\rho_{ss} = \frac{\bar{n}}{2\bar{n}+1} |e\rangle\langle e| + \frac{\bar{n}+1}{2\bar{n}+1} |g\rangle\langle g|$",
"difficulty": 10,
"detailedSolution": "The Lindblad equation for a two-level system is $\dot{\rho} = -i[H, \rho] + \gamma(\bar{n}+1) \mathcal{D}[\sigma_-]\rho + \gamma\bar{n} \mathcal{D}[\sigma_+]\rho$. Setting $\dot{\rho}=0$ and solving for the diagonal elements $\rho_{ee}$ and $\rho_{gg}$ under the condition $\rho_{ee} + \rho_{gg} = 1$ yields the population distribution based on the ratio of excitation/de-excitation rates."
}

Problem: Requires advanced knowledge beyond what is expected at IChO, without introducing the topic on a first-principles basis.

RULES:
- Chemistry MUST be correct. Double-check calculations and products.
- For inorganic compounds/ions, ALWAYS output LaTeX formulas (e.g. $\\ce{H2SO4}$, $\\ce{MnO4^-}$) wrapped in inline math delimiters ($...$) instead of SMILES in the answer and explanations.
- ALWAYS wrap ALL LaTeX formulas, chemical equations, symbols, units, and expressions in inline math delimiters ($...$) or block math delimiters ($$...$$). For example, write $\\Delta G$, $\\ce{H2O}$, or $\\text{kJ/mol}$.
- Reserve SMILES and [[SMILES: ...]] specifically for organic compounds containing 3 or more carbon atoms.
- Write fully valid, complete SMILES strings (avoiding abbreviations). Use the [[SMILES: ...]] format for structures in instructions and explanations.
- GRAPHICAL DIAGRAMS: For questions requiring graphs, plots, or curves (e.g. titration curves, phase diagrams, kinetics plots), you may generate pure SVG code representing the graph/plot. Wrap the SVG code in '[[SVG: <svg>...</svg>]]' and place it inline in the 'instructions' or 'explanation' field. When generating SVG code, adhere strictly to these constraints:
  * Generate the required diagram as a single, self-contained, valid <svg> block.
  * Use Primitive Shapes: Prioritize <circle>, <rect>, <line>, <ellipse>, and <polygon> over complex <path> elements whenever possible.
  * Reuse Components: Use <defs> and <use> elements to define and repeat recurring symbols, labels, or structural markers.
  * Optimize Paths: If a <path> is necessary, use absolute minimum control points. Round coordinates to 1 decimal place maximum. Do not generate dense, pixel-by-pixel coordinate arrays.
  * Leverage CSS Styling: Group elements with <g> and apply shared styles (stroke, fill, stroke-width) to the group rather than repeating attributes on individual elements.
  * No Redundant Data: Omit metadata, editor comments, unnecessary namespaces, or hidden elements. Keep formatting compact.
  * Formatting: Enclose the raw SVG code within standard [[SVG: <svg>...</svg>]] tags. Do not wrap it in markdown code blocks or prose.
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