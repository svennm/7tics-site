// agent-trace.js — browser-side replay player.
// Mounts to a container with [data-trace="<name>"].
// Loads /assets/trace-data/<name>.json and renders ticking state.

import { drainEvents, applyEvents, initialState } from './trace-engine.js';

const TIMELINE_STEPS = [
  { key: 'plan',  matcher: (e) => e.stream === 'planner'  && e.type === 'token' },
  { key: 'strip', matcher: (e) => e.stream === 'defense' },
  { key: 'exec1', matcher: (e) => e.stream === 'executor' && e.type === 'tool_call' },
  { key: 'exec2', matcher: (e) => e.stream === 'executor' && e.type === 'tool_result' },
  { key: 'judge', matcher: (e) => e.stream === 'judge'    && e.type === 'verdict' },
];

class TracePlayer {
  constructor(root, data) {
    this.root  = root;
    this.data  = data;
    this.events = data.events || [];
    this.duration = data.meta?.duration_ms || 0;
    this.speed = 1;
    this.elapsed = 0;
    this.playing = true;
    this.lastTs = null;
    this.loopGapMs = 2000;
    this.loopHoldUntil = 0;
    this.refs = this._cacheRefs();
    this._wireControls();
    this._render(initialState());
    this._tick = this._tick.bind(this);
    requestAnimationFrame(this._tick);
  }

  _cacheRefs() {
    return {
      planner:    this.root.querySelector('[data-pane="planner"] .trace-stream'),
      defense:    this.root.querySelector('[data-pane="defense"] .pane-body'),
      executor:   this.root.querySelector('[data-pane="executor"] .pane-body'),
      judge:      this.root.querySelector('.trace-judge'),
      timeline:   this.root.querySelector('.trace-timeline'),
      playBtn:    this.root.querySelector('[data-action="play"]'),
      resetBtn:   this.root.querySelector('[data-action="reset"]'),
      speedSel:   this.root.querySelector('[data-action="speed"]'),
    };
  }

  _wireControls() {
    this.refs.playBtn?.addEventListener('click', () => {
      this.playing = !this.playing;
      this.refs.playBtn.textContent = this.playing ? '⏸' : '▶';
      this.lastTs = null;
    });
    this.refs.resetBtn?.addEventListener('click', () => {
      this.elapsed = 0;
      this.loopHoldUntil = 0;
      this.lastTs = null;
      this.playing = true;
      if (this.refs.playBtn) this.refs.playBtn.textContent = '⏸';
      this._render(initialState());
    });
    this.refs.speedSel?.addEventListener('change', (e) => {
      this.speed = parseFloat(e.target.value) || 1;
    });
  }

  _tick(ts) {
    if (!this.lastTs) this.lastTs = ts;
    const dt = ts - this.lastTs;
    this.lastTs = ts;

    if (this.loopHoldUntil > 0) {
      if (ts >= this.loopHoldUntil) {
        this.elapsed = 0;
        this.loopHoldUntil = 0;
      }
    } else if (this.playing) {
      this.elapsed += dt * this.speed;
      if (this.elapsed >= this.duration) {
        this.elapsed = this.duration;
        this._renderUpTo(this.elapsed);
        this.loopHoldUntil = ts + this.loopGapMs;
        requestAnimationFrame(this._tick);
        return;
      }
    }

    this._renderUpTo(this.elapsed);
    requestAnimationFrame(this._tick);
  }

  _renderUpTo(elapsed) {
    const drained = drainEvents(this.events, 0, elapsed);
    const state = applyEvents(initialState(), drained);
    this._render(state, drained);
  }

  _render(state, drained = []) {
    if (this.refs.planner) {
      this.refs.planner.textContent = state.planner;
      const cursor = document.createElement('span');
      cursor.className = 'trace-cursor';
      cursor.textContent = ' ';
      this.refs.planner.appendChild(cursor);
    }
    if (this.refs.defense) {
      this.refs.defense.innerHTML = state.defense.map(d => `
        <div class="trace-strip-row ${d.type === 'strip' ? 'stripped' : 'kept'}">
          <span class="tag">&lt;${escapeHtml(d.tag)}&gt;</span>
          <span>${d.type === 'strip' ? '⚠ STRIPPED' : '✓ KEPT'}</span>
          <span style="margin-left:auto;opacity:.6">${escapeHtml(d.reason || '')}</span>
        </div>
      `).join('');
    }
    if (this.refs.executor) {
      this.refs.executor.innerHTML = state.executor.map(e => `
        <div class="trace-tool-row">
          ▸ <span class="name">${escapeHtml(e.name)}</span>(${escapeHtml(formatArgs(e.args))})
          <div>
            <span class="status">${e.pending ? '… running' : `${e.status} OK`}</span>
            <span class="meta">${e.pending ? '' : `· ${escapeHtml(e.size || '')} · ${e.duration_ms || 0}ms`}</span>
          </div>
        </div>
      `).join('');
    }
    if (this.refs.judge) {
      if (state.judge) {
        this.refs.judge.innerHTML = `
          <div><span class="verdict">${escapeHtml(state.judge.value)}</span>
               · confidence ${state.judge.confidence}
               ${state.judge.cited?.length ? `· cited ${escapeHtml(state.judge.cited.join(', '))}` : ''}</div>
          <div class="reasoning">"${escapeHtml(state.judge.reasoning)}"</div>
        `;
      } else {
        this.refs.judge.innerHTML = `<div style="color:var(--dim)">awaiting verdict…</div>`;
      }
    }
    if (this.refs.timeline) {
      const reached = TIMELINE_STEPS.map(step => drained.some(step.matcher));
      this.refs.timeline.innerHTML = TIMELINE_STEPS.map((step, i) => `
        <span class="step ${reached[i] ? 'done' : ''}" title="${step.key}"></span>
        <span class="label">${step.key}</span>
      `).join('');
    }
  }
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
function formatArgs(args) {
  if (!args) return '';
  try { return JSON.stringify(args).slice(1, -1); } catch { return ''; }
}

async function mountAll() {
  const containers = document.querySelectorAll('[data-trace]');
  for (const root of containers) {
    const name = root.dataset.trace;
    try {
      const res = await fetch(`/assets/trace-data/${name}.json`);
      if (!res.ok) throw new Error(`fetch failed ${res.status}`);
      const data = await res.json();
      new TracePlayer(root, data);
    } catch (err) {
      console.error('[trace] load failed', name, err);
      root.innerHTML = `<div style="padding:24px;color:var(--dim);text-align:center">
        trace replay unavailable · <a href="https://github.com/svennm" target="_blank" rel="noopener">view repo</a>
      </div>`;
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountAll);
} else {
  mountAll();
}
