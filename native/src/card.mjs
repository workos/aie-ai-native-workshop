// native/src/card.mjs
// Render a self-contained before/after "AI-Native" card as an HTML string. No
// external assets (inline CSS only) so it is offline-safe and shareable. `after`
// is optional: the opening card omits it and shows no delta.
import { PILLARS } from './pillars.mjs';
import { score } from './score.mjs';

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function bars(sc) {
  return PILLARS.map((p) => {
    const pct = Math.round(sc.pillars[p.id] * 100);
    return `<div class="bar"><span>${esc(p.label)}</span>` +
      `<div class="t"><div class="f" style="width:${pct}%"></div></div></div>`;
  }).join('');
}

export function renderCard({ before, after = null, name = 'You' } = {}) {
  const b = score(before);
  const a = after ? score(after) : null;
  const shown = a ?? b;
  const delta = a ? `<div class="delta">+${a.total - b.total}</div>` : '';
  const css = `
    body{margin:0;background:#0a0e17;font-family:-apple-system,system-ui,sans-serif}
    .card{max-width:380px;margin:32px auto;padding:28px;border-radius:20px;color:#04130d;
      background:linear-gradient(140deg,#18c598,#8a86f5)}
    .hd{font:700 12px ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;opacity:.85}
    .big{font:800 72px/1 ui-monospace,monospace;letter-spacing:-.04em;margin:14px 0 0}
    .delta{display:inline-block;margin:8px 0 0;font:800 16px ui-monospace,monospace}
    .bars{margin-top:18px;display:flex;flex-direction:column;gap:9px}
    .bar{display:grid;grid-template-columns:84px 1fr;gap:10px;align-items:center;
      font:11px ui-monospace,monospace}
    .t{height:8px;background:rgba(0,0,0,.18);border-radius:6px;overflow:hidden}
    .f{height:100%;background:rgba(4,19,13,.8);border-radius:6px}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<title>AI-Native — ${esc(name)}</title><style>${css}</style></head><body>` +
    `<div class="card"><div class="hd">AI-Native · ${esc(name)}</div>` +
    `<div class="big">${shown.total}%</div>${delta}` +
    `<div class="bars">${bars(shown)}</div></div></body></html>`;
}
