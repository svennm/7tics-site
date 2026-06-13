// trace-engine.js — pure logic for agent-trace JSON replay.
// No DOM access. Importable in node:test.

export function drainEvents(events, fromTime, toTime) {
  return [...events]
    .sort((a, b) => a.t - b.t)
    .filter((e) => e.t >= fromTime && e.t <= toTime);
}
