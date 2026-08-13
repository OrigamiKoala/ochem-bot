import assert from 'assert';
import { saveQueueToCache } from './src/utils/localStorage.js';

// Setup mock localStorage
let mockStorage = {};
let throwError = false;

global.localStorage = {
  setItem(key, value) {
    if (throwError) throw new Error('Mock Storage Error');
    mockStorage[key] = value;
  },
  getItem(key) {
    return mockStorage[key] || null;
  },
  removeItem(key) {
    delete mockStorage[key];
  },
  clear() {
    mockStorage = {};
  }
};

function runTests() {
  console.log('Testing saveQueueToCache...');

  // Test valid save
  saveQueueToCache({ id: 1 }, [{ id: 2 }], false, false);
  let cached = JSON.parse(localStorage.getItem('ochem_reaction_queue'));
  assert.strictEqual(cached.length, 2);
  assert.strictEqual(cached[0].id, 1);
  assert.strictEqual(cached[1].id, 2);

  // Test error save
  let originalWarn = console.warn;
  let warnCalled = false;
  console.warn = () => { warnCalled = true; };

  throwError = true;
  saveQueueToCache({ id: 1 }, [{ id: 2 }], false, false);

  assert.strictEqual(warnCalled, true);

  console.warn = originalWarn; // Restore original console.warn

  console.log('All tests passed.');
}

runTests();
