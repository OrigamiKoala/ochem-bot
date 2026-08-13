import assert from 'assert';
import { isSimpleSmiles, smilesToFormula } from './src/utils/smiles.js';

function runTests() {
  console.log('Testing isSimpleSmiles...');
  assert.strictEqual(isSimpleSmiles('[OH-]'), true);
  assert.strictEqual(isSimpleSmiles('O=O'), true);
  assert.strictEqual(isSimpleSmiles('CC(=O)Cl'), true);
  assert.strictEqual(isSimpleSmiles('C1=CC=CC=C1'), false); // Contains rings
  assert.strictEqual(isSimpleSmiles('C1=CC=C(C=C1)O'), false); // Complex and contains rings
  assert.strictEqual(isSimpleSmiles(''), false);
  assert.strictEqual(isSimpleSmiles(null), false);

  console.log('Testing smilesToFormula...');
  assert.strictEqual(smilesToFormula('[OH-]'), 'OH^{-}');
  assert.strictEqual(smilesToFormula('O=O'), 'O2');
  assert.strictEqual(smilesToFormula('BrBr'), 'Br2');
  assert.strictEqual(smilesToFormula('[Na+]'), 'Na^{+}');
  assert.strictEqual(smilesToFormula('[Pd]'), 'Pd');
  assert.strictEqual(smilesToFormula('NaOH'), 'NaOH');
  assert.strictEqual(smilesToFormula('[OH-].[Na+]'), 'OH^{-} \\cdot Na^{+}');
  assert.strictEqual(smilesToFormula('CC(=O)Cl'), 'CH3COCl'); // From lookup

  console.log('All tests passed.');
}

runTests();
