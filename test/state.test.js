'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { evaluateFreshness } = require('../scripts/lib/freshness');
const { activeEntries } = require('../scripts/lib/memory');

test('freshness: all categories within TTL -> fresh', () => {
  const now = Date.parse('2026-06-14T12:00:00Z');
  const prof = { freshness: {
    os: { checked_at: '2026-06-14T00:00:00Z', ttl_h: 720 },
    ssl: { checked_at: '2026-06-14T06:00:00Z', ttl_h: 12 },
    disks: { checked_at: '2026-06-14T11:30:00Z', ttl_h: 1 },
  } };
  assert.equal(evaluateFreshness(prof, now).health, 'fresh');
});

test('freshness: high-risk category past TTL -> critical_stale', () => {
  const now = Date.parse('2026-06-14T12:00:00Z');
  const prof = { freshness: {
    ssl: { checked_at: '2026-06-13T00:00:00Z', ttl_h: 12 }, // 36h old > 12h
    disks: { checked_at: '2026-06-14T11:30:00Z', ttl_h: 1 },
  } };
  const r = evaluateFreshness(prof, now);
  assert.equal(r.health, 'critical_stale');
  assert.ok(r.criticalStale.includes('ssl'));
});

test('freshness: only non-critical category past TTL -> stale', () => {
  const now = Date.parse('2026-06-21T12:00:00Z');
  const prof = { last_discovery: '2026-06-01T00:00:00Z', freshness: {
    stack: { checked_at: '2026-06-01T00:00:00Z', ttl_h: 168 }, // 20d > 7d
    ssl: { checked_at: '2026-06-21T06:00:00Z', ttl_h: 12 },
    firewall: { checked_at: '2026-06-21T06:00:00Z', ttl_h: 24 },
    disks: { checked_at: '2026-06-21T11:30:00Z', ttl_h: 1 },
  } };
  assert.equal(evaluateFreshness(prof, now).health, 'stale');
});

test('freshness: sparse profile is not flagged (no checked_at -> skipped)', () => {
  const now = Date.parse('2026-06-14T12:00:00Z');
  assert.equal(evaluateFreshness({}, now).health, 'fresh');
});

test('memory: newest wins, tombstone + expiry dropped', () => {
  const now = Date.parse('2026-06-14T12:00:00Z');
  const entries = [
    { scope: 'global', title: 'a', type: 'instruction', fact: 'old', confidence: 'high' },
    { scope: 'global', title: 'a', type: 'instruction', fact: 'new', confidence: 'high' },
    { scope: 'global', title: 'b', type: 'lesson', fact: 'gone', status: 'forgotten' },
    { scope: 'global', title: 'c', type: 'note', fact: 'expired', expires_at: '2026-01-01T00:00:00Z' },
    { scope: 'global', title: 'd', type: 'note', fact: 'live', confidence: 'low' },
  ];
  const act = activeEntries(entries, now);
  assert.deepEqual(act.map((e) => e.title).sort(), ['a', 'd']);
  assert.equal(act.find((e) => e.title === 'a').fact, 'new');
});
