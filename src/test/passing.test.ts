import assert from 'assert';
import { test } from 'node:test';

test('simple passing test', () => {
  assert.strictEqual(true, true, 'This should always pass');
});
