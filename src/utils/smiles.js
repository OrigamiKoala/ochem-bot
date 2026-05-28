// ---- SMILES-to-formula conversion for simple reagents ----

export const SMILES_TO_FORMULA = {
  // Common ions
  '[OH-]': 'OH^{-}', '[O-]': 'O^{-}', '[Na+]': 'Na^{+}', '[K+]': 'K^{+}',
  '[Li+]': 'Li^{+}', '[NH4+]': 'NH4^{+}', '[NH2-]': 'NH2^{-}',
  '[Cl-]': 'Cl^{-}', '[Br-]': 'Br^{-}', '[I-]': 'I^{-}', '[F-]': 'F^{-}',
  '[H-]': 'H^{-}', '[H+]': 'H^{+}', '[BH4-]': 'BH4^{-}',
  '[AlH4-]': 'AlH4^{-}', '[CN-]': 'CN^{-}', 'N#[C-]': 'CN^{-}',
  '[N-]=[N+]=[N-]': 'N3^{-}', '[O-][O-]': 'O2^{2-}',
  // Common diatomic / small molecules (both notations)
  'BrBr': 'Br2', '[Br][Br]': 'Br2', 'ClCl': 'Cl2', '[Cl][Cl]': 'Cl2',
  'FF': 'F2', '[F][F]': 'F2', 'II': 'I2', '[I][I]': 'I2',
  'O=O': 'O2', '[H][H]': 'H2', 'O': 'H2O', 'N': 'NH3',
  'S': 'H2S', 'P': 'PH3',
  // Common reagents
  'OO': 'H2O2', 'Cl': 'HCl', 'Br': 'HBr', 'I': 'HI', 'F': 'HF',
  'O=S(=O)O': 'H2SO4', 'O=[N+]([O-])O': 'HNO3',
  'O=C=O': 'CO2', 'C=O': 'CH2O', 'CS': 'CH3SH',
  'CC(=O)Cl': 'CH3COCl', 'CC(=O)O': 'CH3COOH', 'CC=O': 'CH3CHO',
  'CCO': 'EtOH', 'CO': 'MeOH', 'CCOC': 'Et2O',
  'ClS(Cl)=O': 'SOCl2', 'ClP(Cl)Cl': 'PCl3', 'ClP(Cl)(Cl)=O': 'POCl3',
  'ClP(Cl)(Cl)(Cl)Cl': 'PCl5',
  'O=S(Cl)Cl': 'SOCl2',
  'OB(O)O': 'B(OH)3', '[BH3-]': 'BH3',
  // Grignard-type / organometallics
  '[Mg]': 'Mg', '[Zn]': 'Zn', '[Cu]': 'Cu', '[Pd]': 'Pd', '[Pt]': 'Pt',
  '[Ag]': 'Ag', '[Al]': 'Al',
};

export const monochromeTheme = {
  C: '#000', O: '#000', N: '#000', P: '#000', S: '#000', B: '#000',
  F: '#000', Cl: '#000', Br: '#000', I: '#000', H: '#000',
  BACKGROUND: 'transparent'
};

export const smilesOptions = {
  padding: 10,
  themes: { monochrome: monochromeTheme }
};

// Heuristic: is this SMILES "simple enough" to render as a formula?
export function isSimpleSmiles(smiles) {
  if (!smiles) return false;
  const s = smiles.trim();

  if (SMILES_TO_FORMULA[s]) return true;

  // Single atom in brackets (ions): [O-], [Na+], [NH2+], etc.
  if (/^\[[A-Za-z][a-z]?[HhDd]?\d*[+\-]\d*\]$/.test(s)) return true;

  // Count heavy atoms (uppercase letters = atoms in SMILES)
  const heavyAtoms = (s.match(/[A-Z]/g) || []).length;

  // Contains rings? (digit characters in SMILES denote ring closures)
  const hasRings = /\d/.test(s.replace(/\[[^\]]*\]/g, '')); // ignore digits inside brackets

  if (heavyAtoms <= 3 && !hasRings) return true;

  return false;
}

// Convert a simple SMILES to an mhchem formula string.
// Returns null if no conversion is available.
export function smilesToFormula(smiles) {
  if (!smiles) return null;
  const s = smiles.trim();

  if (SMILES_TO_FORMULA[s]) return SMILES_TO_FORMULA[s];

  // Single bracketed ion: [OH-] -> OH^{-}, [Na+] -> Na^{+}
  const ionMatch = s.match(/^\[([A-Za-z][a-z]?[HhDd]?\d*)([+\-]\d*)\]$/);
  if (ionMatch) {
    const atom = ionMatch[1];
    const charge = ionMatch[2];
    return `${atom}^{${charge}}`;
  }

  // Single bracketed atom (no charge): [Br] -> Br, [Pd] -> Pd
  const bracketAtom = s.match(/^\[([A-Z][a-z]?)\]$/);
  if (bracketAtom) return bracketAtom[1];

  // Two bracketed identical atoms: [Br][Br] -> Br2
  const bracketDiatomic = s.match(/^\[([A-Z][a-z]?)\]\[(\1)\]$/);
  if (bracketDiatomic) return `${bracketDiatomic[1]}2`;

  // Fallback: try matching [X][Y] pattern (two bracketed atoms)
  const twoBrackets = s.match(/^\[([A-Z][a-z]?)\]\[([A-Z][a-z]?)\]$/);
  if (twoBrackets) {
    if (twoBrackets[1] === twoBrackets[2]) return `${twoBrackets[1]}2`;
    return `${twoBrackets[1]}${twoBrackets[2]}`;
  }

  // Two-letter element repeated (diatomic): BrBr -> Br2
  const diatomicMatch = s.match(/^([A-Z][a-z]?)\1$/);
  if (diatomicMatch) return `${diatomicMatch[1]}2`;

  // Very simple: just a few uppercase letters with lowercase, no special chars
  if (/^[A-Za-z]+$/.test(s) && s.length <= 6) {
    return s;
  }

  return null;
}

// Helper to sanitize SMILES syntax to prevent parser crashes
export function cleanSmiles(smiles) {
  if (!smiles) return null;
  let s = smiles.trim();

  // Strip [[SMILES: ...]] wrapping if still present (legacy/fallback)
  s = s.replace(/^\[\[\s*SMILES:\s*([\s\S]*?)\s*\]\]$/, '$1').trim();

  if (s.length === 0) return null;

  // Balance brackets — only trim excess closing ] at the end (don't prepend [)
  const openBrackets = (s.match(/\[/g) || []).length;
  const closeBrackets = (s.match(/\]/g) || []).length;
  if (openBrackets > closeBrackets) {
    s += ']'.repeat(openBrackets - closeBrackets);
  } else if (closeBrackets > openBrackets) {
    let excess = closeBrackets - openBrackets;
    while (excess > 0 && s.endsWith(']')) {
      s = s.substring(0, s.length - 1);
      excess--;
    }
  }

  // Check for hanging bond operators (truncated AI output)
  if (/[\-\+\=\#]$/.test(s) && !s.endsWith(']')) {
    console.warn("cleanSmiles: rejecting truncated SMILES:", s);
    return null;
  }

  return s;
}
