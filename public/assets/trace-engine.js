// trace-engine.js — pure logic for agent-trace JSON replay.
// No DOM access. Importable in node:test.

export function drainEvents(events, fromTime, toTime) {
  return [...events]
    .sort((a, b) => a.t - b.t)
    .filter((e) => e.t >= fromTime && e.t <= toTime);
}

export function initialState() {
  return {
    planner: '',
    defense: [],
    executor: [],
    judge: null,
  };
}

export function applyEvents(state, events) {
  const next = {
    planner: state.planner,
    defense: [...state.defense],
    executor: [...state.executor],
    judge: state.judge,
  };
  for (const ev of events) {
    if (ev.stream === 'planner' && ev.type === 'token') {
      next.planner += ev.value;
    } else if (ev.stream === 'defense' && (ev.type === 'strip' || ev.type === 'keep')) {
      next.defense.push({ type: ev.type, tag: ev.tag, reason: ev.reason });
    } else if (ev.stream === 'executor' && ev.type === 'tool_call') {
      next.executor.push({ name: ev.name, args: ev.args, pending: true });
    } else if (ev.stream === 'executor' && ev.type === 'tool_result') {
      // Pair with last pending call
      for (let i = next.executor.length - 1; i >= 0; i--) {
        if (next.executor[i].pending) {
          next.executor[i] = {
            ...next.executor[i],
            pending: false,
            status: ev.status,
            size: ev.size,
            duration_ms: ev.duration_ms,
          };
          break;
        }
      }
    } else if (ev.stream === 'judge' && ev.type === 'verdict') {
      next.judge = {
        value: ev.value,
        confidence: ev.confidence,
        cited: ev.cited || [],
        reasoning: ev.reasoning || '',
      };
    }
  }
  return next;
}
