// scratch/format_examples.cjs
const fs = require('fs');

const content = fs.readFileSync('/Users/carlliu/stress-sandbox/api/generate.js', 'utf8');

function getBlock(name) {
  const startIdx = content.indexOf(name);
  if (startIdx === -1) throw new Error("Could not find " + name);
  
  const braceStart = content.indexOf('{', startIdx);
  if (braceStart === -1) throw new Error("Could not find { for " + name);
  
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = braceStart; i < content.length; i++) {
    const ch = content.charAt(i);
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return content.substring(braceStart, i + 1);
      }
    }
  }
  throw new Error("Braces not closed for " + name);
}

let raw6 = getBlock("IChO Question Example 6:");
let raw7 = getBlock("IChO Question Example 7:");
let raw8 = getBlock("IChO Question Example 8:");
let raw9 = getBlock("IChO Question Example 9:");

// Apply fixes to all raw strings:
for (let id of [6, 7, 8, 9]) {
  if (id === 6) raw6 = raw6.replace(/(?<!\\)((?:\\\\)*)\\(['`])/g, "$1$2");
  if (id === 7) raw7 = raw7.replace(/(?<!\\)((?:\\\\)*)\\(['`])/g, "$1$2");
  if (id === 8) raw8 = raw8.replace(/(?<!\\)((?:\\\\)*)\\(['`])/g, "$1$2");
  if (id === 9) raw9 = raw9.replace(/(?<!\\)((?:\\\\)*)\\(['`])/g, "$1$2");
}

console.log("Found and fixed raw blocks!");

const obj6 = JSON.parse(raw6);
const obj7 = JSON.parse(raw7);
const obj8 = JSON.parse(raw8);
const obj9 = JSON.parse(raw9);

console.log("Parsed all four blocks successfully!");

function mapToSchema(obj, id) {
  let qtype = "conceptual";
  if (id === 6 || id === 8 || id === 9) qtype = "calculate";
  if (id === 7) qtype = "conceptual";
  
  // Format instructions to convert SVG code blocks to [[SVG: ...]]
  let instructions = obj.question;
  instructions = instructions.replace(/```xml\s*(<svg[\s\S]*?<\/svg>)\s*```/g, (match, p1) => {
    let svg = p1.trim();
    return `[[SVG: ${svg}]]`;
  });
  
  // Let's generate a hint
  let hint = "";
  if (id === 6) {
    hint = "Use Clausius-Clapeyron equation to relate vapor pressure of water over hydrates to saturated vapor pressure. Remember that activity coefficient is given as 2.45.";
  } else if (id === 7) {
    hint = "Calculate the initial slope of the curve to find the reaction rate, then convert it to molecules per site per second using the site density.";
  } else if (id === 8) {
    hint = "Relate the melting point variation with pressure using the Clapeyron equation. Consider the relative densities of Ice I, Ice V, and liquid water.";
  } else if (id === 9) {
    hint = "Precipitation of CaF2 consumes 2 moles of fluoride per mole of calcium. The excess fluoride forms Na3AlF6 with Al3+.";
  }

  // Answer mapping
  let answer = "";
  if (id === 6) {
    answer = "a. \\\\ce{CuSO4*5H2O}\\nb. 31^{\\\\circ}\\\\text{C}\\nc. see explanation\\nd. 0.54\\\\% \\\\text{ wt.}\\ne. 0.19\\\\% \\\\text{ wt. at } 0^{\\\\circ}\\\\text{C}, 0.93\\\\% \\\\text{ wt. at } 40^{\\\\circ}\\\\text{C}";
  } else if (id === 7) {
    answer = "a. \\\\text{s}^{-1}, \\\\text{TON} \\\\leq \\\\text{TOF} \\\\times t\\nb. 21 \\\\text{ s}^{-1}\\nc. \\\\text{TOF} \\\\approx 21 \\\\text{ s}^{-1}, \\\\text{TON} \\\\approx 5.0 \\\\times 10^4\\nd. \\\\text{TOF} \\\\approx 0.067 \\\\text{ s}^{-1}, n_1 \\\\approx 136 \\\\text{ atoms/site}\\ne. 12";
  } else if (id === 8) {
    answer = "a. boiling point and Ice V melting point increase with pressure, Ice I melting point decreases\\nb. (i) Vapor \\\\rightarrow Ice I \\\\rightarrow Ice III \\\\rightarrow Ice V \\\\rightarrow Ice VI \\\\rightarrow Ice VII, (ii) Vapor \\\\rightarrow Liquid \\\\rightarrow Ice VI \\\\rightarrow Ice VII, (iii) Gas/Supercritical Fluid \\\\rightarrow Ice VII\\nc. 258 K\\nd. Ice VII is densest, melting point at 10 GPa is 845 K\\ne. 1.59 \\\\text{ g/cm}^3\\nf. 6.01 \\\\text{ kJ/mol}";
  } else if (id === 9) {
    answer = "a. \\\\ce{[Al(H2O)6]^{3+} + H2O <=> [Al(OH)(H2O)5]^{2+} + H3O^+}, \\\\ce{NaCl} drives cryolite precipitation\\nb. hydrolysis is endothermic\\nc. 0.00288 mol (0.115 g) Ca\\nd. 1.11 \\\\times 10^{-4} mol silicic acid, phenol red indicator";
  }

  return {
    qtype,
    reactants: "",
    reagents: "",
    conditions: "",
    answer,
    instructions,
    hint,
    explanation: obj.detailedSolution
  };
}

const mapped6 = mapToSchema(obj6, 6);
const mapped7 = mapToSchema(obj7, 7);
const mapped8 = mapToSchema(obj8, 8);
const mapped9 = mapToSchema(obj9, 9);

const finalArray = [mapped6, mapped7, mapped8, mapped9];

let jsonStr = JSON.stringify(finalArray, null, 2);

// Remove the outer [ and ]
jsonStr = jsonStr.trim();
if (jsonStr.startsWith('[')) jsonStr = jsonStr.slice(1);
if (jsonStr.endsWith(']')) jsonStr = jsonStr.slice(0, -1);
jsonStr = jsonStr.trim();

// 1. First, make sure backslashes are double-escaped:
let templateLiteralCode = jsonStr.replace(/\\/g, '\\\\');

// 2. Escape all backticks:
templateLiteralCode = templateLiteralCode.replace(/`/g, '\\`');

// 3. Escape all ${:
templateLiteralCode = templateLiteralCode.replace(/\$\{/g, '\\${');

fs.writeFileSync('/Users/carlliu/ochem-bot/scratch/formatted_output.txt', templateLiteralCode, 'utf8');
console.log("Successfully formatted and saved to scratch/formatted_output.txt!");
