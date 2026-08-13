import assert from 'assert';
import { parseSmilesSegments } from './src/utils/richText.js';

function runTests() {
  console.log('Testing parseSmilesSegments...');

  // Test plain text
  assert.deepStrictEqual(parseSmilesSegments('Plain text here'), [
    { type: 'text', content: 'Plain text here' }
  ]);

  // Test simple SMILES
  assert.deepStrictEqual(parseSmilesSegments('Text before [[SMILES: O=C=O]] text after'), [
    { type: 'text', content: 'Text before ' },
    { type: 'smiles', content: 'O=C=O' },
    { type: 'text', content: ' text after' }
  ]);

  // Test SVG
  assert.deepStrictEqual(parseSmilesSegments('Text before [[SVG: <svg></svg>]] text after'), [
    { type: 'text', content: 'Text before ' },
    { type: 'svg', content: '<svg></svg>' },
    { type: 'text', content: ' text after' }
  ]);

  // Test nested brackets in SMILES
  assert.deepStrictEqual(parseSmilesSegments('Reaction [[SMILES: [Na+].[Cl-]]] product'), [
    { type: 'text', content: 'Reaction ' },
    { type: 'smiles', content: '[Na+].[Cl-]' },
    { type: 'text', content: ' product' }
  ]);

  // Test multiple tags
  assert.deepStrictEqual(parseSmilesSegments('[[SMILES: C]] and [[SVG: <svg/>]]'), [
    { type: 'smiles', content: 'C' },
    { type: 'text', content: ' and ' },
    { type: 'svg', content: '<svg/>' }
  ]);

  console.log('All tests passed.');
}

runTests();
