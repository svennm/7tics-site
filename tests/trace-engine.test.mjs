import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drainEvents } from '../public/assets/trace-engine.js';

const events = [
  { t: 0,    stream: 'planner',  type: 'token', value: 'a' },
  { t: 100,  stream: 'planner',  type: 'token', value: 'b' },
  { t: 250,  stream: 'defense',  type: 'strip', tag: 'thinking' },
  { t: 500,  stream: 'executor', type: 'tool_call', name: 'read_file' },
  { t: 1000, stream: 'judge',    type: 'verdict', value: 'PASS' },
];

test('drainEvents returns events with t in [fromTime, toTime]', () => {
  const drained = drainEvents(events, 100, 500);
  assert.equal(drained.length, 3);
  assert.equal(drained[0].t, 100);
  assert.equal(drained[2].t, 500);
});

test('drainEvents excludes events before fromTime', () => {
  const drained = drainEvents(events, 200, 1500);
  assert.equal(drained.length, 3);
  assert.equal(drained[0].t, 250);
});

test('drainEvents excludes events after toTime', () => {
  const drained = drainEvents(events, 0, 300);
  assert.equal(drained.length, 3);
  assert.equal(drained.at(-1).t, 250);
});

test('drainEvents returns empty array when range empty', () => {
  const drained = drainEvents(events, 600, 900);
  assert.equal(drained.length, 0);
});

test('drainEvents handles unsorted input by sorting on t', () => {
  const unsorted = [
    { t: 500, x: 'c' },
    { t: 100, x: 'a' },
    { t: 300, x: 'b' },
  ];
  const drained = drainEvents(unsorted, 0, 600);
  assert.deepEqual(drained.map(e => e.x), ['a', 'b', 'c']);
});

import { applyEvents, initialState } from '../public/assets/trace-engine.js';

test('initialState has empty streams', () => {
  const s = initialState();
  assert.deepEqual(s.planner, '');
  assert.deepEqual(s.defense, []);
  assert.deepEqual(s.executor, []);
  assert.equal(s.judge, null);
});

test('applyEvents appends planner tokens in order', () => {
  const s = applyEvents(initialState(), [
    { t: 0,  stream: 'planner', type: 'token', value: 'foo' },
    { t: 10, stream: 'planner', type: 'token', value: 'bar' },
  ]);
  assert.equal(s.planner, 'foobar');
});

test('applyEvents accumulates defense strip/keep entries', () => {
  const s = applyEvents(initialState(), [
    { t: 0, stream: 'defense', type: 'strip', tag: 'thinking', reason: 'r1' },
    { t: 1, stream: 'defense', type: 'keep',  tag: 'plan',     reason: 'r2' },
  ]);
  assert.equal(s.defense.length, 2);
  assert.equal(s.defense[0].type, 'strip');
  assert.equal(s.defense[1].type, 'keep');
});

test('applyEvents pairs tool_call with subsequent tool_result', () => {
  const s = applyEvents(initialState(), [
    { t: 0,   stream: 'executor', type: 'tool_call',   name: 'foo', args: {q: 'x'} },
    { t: 100, stream: 'executor', type: 'tool_result', status: 200, size: '1KB', duration_ms: 100 },
  ]);
  assert.equal(s.executor.length, 1);
  assert.equal(s.executor[0].name, 'foo');
  assert.equal(s.executor[0].status, 200);
  assert.equal(s.executor[0].size, '1KB');
});

test('applyEvents leaves tool_call pending until result arrives', () => {
  const s = applyEvents(initialState(), [
    { t: 0, stream: 'executor', type: 'tool_call', name: 'foo', args: {} },
  ]);
  assert.equal(s.executor.length, 1);
  assert.equal(s.executor[0].pending, true);
});

test('applyEvents sets judge verdict', () => {
  const s = applyEvents(initialState(), [
    { t: 0, stream: 'judge', type: 'verdict', value: 'PASS', confidence: 0.9, reasoning: 'looks good' },
  ]);
  assert.equal(s.judge.value, 'PASS');
  assert.equal(s.judge.confidence, 0.9);
});
