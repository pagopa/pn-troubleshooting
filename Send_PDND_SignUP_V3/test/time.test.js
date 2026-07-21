import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDuration } from '../src/shared/time.js';

test('execution duration is formatted for logs', () => {
    assert.equal(formatDuration(3_724_567), '1h 2m 4s (3724567 ms)');
});
