import assert from 'assert';
import { renderSVG } from './src/utils/svglib.js';

// Setup mock DOMParser for Node environment testing
class MockDOMParser {
  parseFromString(str, type) {
    if (str === 'malformed') throw new Error('Malformed SVG');
    if (str === 'invalid') return { documentElement: { tagName: 'div' } };

    return {
      documentElement: {
        tagName: 'svg',
        style: {}
      }
    };
  }
}
global.DOMParser = MockDOMParser;

function runTests() {
  console.log('Testing renderSVG...');

  const mockContainer = {
    children: [],
    appendChild(child) {
      this.children.push(child);
    }
  };

  // Test valid SVG
  const validResult = renderSVG('<svg></svg>', mockContainer);
  assert.strictEqual(validResult, true);
  assert.strictEqual(mockContainer.children.length, 1);
  assert.strictEqual(mockContainer.children[0].tagName, 'svg');

  // Test malformed SVG
  const malformedResult = renderSVG('malformed', mockContainer);
  assert.strictEqual(malformedResult, false);
  assert.strictEqual(mockContainer.children.length, 1); // Not appended

  // Test invalid SVG (wrong tag name)
  const invalidResult = renderSVG('invalid', mockContainer);
  assert.strictEqual(invalidResult, false);
  assert.strictEqual(mockContainer.children.length, 1); // Not appended

  console.log('All tests passed.');
}

runTests();
