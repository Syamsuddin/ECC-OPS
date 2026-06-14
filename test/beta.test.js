'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { betai, betaInv, lowerBound } = require('../scripts/lib/beta');
const close = (a, b, t) => Math.abs(a - b) <= (t || 1e-3);

test('betai matches known incomplete-beta values', () => {
  assert.ok(close(betai(0.5, 1, 1), 0.5));
  assert.ok(close(betai(0.5, 2, 2), 0.5));
  assert.ok(close(betai(0.7, 2, 3), 0.9163, 2e-3));
  assert.equal(betai(0, 2, 3), 0);
  assert.equal(betai(1, 2, 3), 1);
});

test('betaInv inverts betai (roundtrip)', () => {
  for (const [a, b] of [[2, 5], [10, 3], [21, 1]]) {
    const x = betaInv(0.3, a, b);
    assert.ok(close(betai(x, a, b), 0.3, 1e-3), `roundtrip a=${a} b=${b}`);
  }
});

test('lowerBound: Beta(a,1) 5th percentile = 0.05^(1/a); promotion threshold behaviour', () => {
  assert.ok(close(lowerBound(21, 1, 0.05), Math.pow(0.05, 1 / 21)));
  assert.ok(lowerBound(21, 1, 0.05) < 0.95);  // 20 flawless prod alone is not enough
  assert.ok(lowerBound(60, 1, 0.05) >= 0.95); // needs substantial (weighted) evidence
});
