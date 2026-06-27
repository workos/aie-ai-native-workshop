/* ═══════════════════════════════════════════════════════════════════════════
   THE AI-NATIVE ENGINEER — board engine
   Data contract (GET /api/board) → render. No API? built-in live simulator.

   Axis = workflow automation / leverage (0 = manual toil … 100 = fully
   automated with agents/hooks/schedules). Attendees walk in on the LEFT and
   migrate RIGHT over the session. Marquee = engineering-hours/week reclaimed.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const $ = (s, r = document) => r.querySelector(s);

/* ── function + theme palettes ──────────────────────────────────────────────
   LEVERAGE  = horizontal position + the accent "fire" (cool→accent). The
               accent (--acc, a teal-green) is reserved for automation, so the
               function colors below deliberately avoid that hue.
   FUNCTION  = dot color (muted, high-contrast, projector-legible).
   THEME     = the 5 theme-bubble colours (timesink/friction/goal/built/next),
               lives ONLY in the lower constellation. */
const FN_ORDER = ['backend', 'frontend', 'fullstack', 'infra', 'ml', 'lead'];
const FN_META = {
  backend:   { label: 'Backend',           color: '#5b8def' },  // blue
  frontend:  { label: 'Frontend',          color: '#c77dff' },  // violet
  fullstack: { label: 'Full-stack',        color: '#f78da7' },  // rose
  infra:     { label: 'Infra / Platform',  color: '#e0a458' },  // amber
  ml:        { label: 'ML / Data',         color: '#4cc9d4' },  // cyan (distinct from accent green)
  lead:      { label: 'Lead / Architect',  color: '#9aa6b8' },  // slate
};
// alternate function palettes (Tweaks-selectable). First entry maps to FN_ORDER[0], etc.
const PALETTES = {
  Terminal: ['#5b8def', '#c77dff', '#f78da7', '#e0a458', '#4cc9d4', '#9aa6b8'],
  Neon:     ['#4f9dff', '#b15cff', '#ff6f9c', '#ffb648', '#33d6e0', '#aab4c6'],
  Muted:    ['#6f8fc4', '#a87fc4', '#cf8499', '#c79a5e', '#5fb0b8', '#8b95a6'],
};
// pre-phase themes: timesink / friction / goal · post-phase themes: built / next
const Q_META = {
  timesink: { label: 'Biggest timesink', color: '#e0a458', phase: 'pre' },
  friction: { label: 'Where it sticks',  color: '#f78da7', phase: 'pre' },
  goal:     { label: 'Want to automate', color: '#5b8def', phase: 'pre' },
  built:    { label: 'Built today',      color: '#16c391', phase: 'post' },
  next:     { label: 'Building next',    color: '#4cc9d4', phase: 'post' },
};

/* ── seeded AIE SF run (senior engineering audience) ───────────────────────
   ~26 developers across 6 functions. pre = mostly manual toil (low leverage),
   post = automated with hooks/skills/schedules (high leverage). */
// per-person verbatim responses (anonymous, developer-flavored)
const RESP = {
  backend: [
    ["I hand-run the same test suite all day.", "A hook runs tests on every edit now."],
    ["I babysit every deploy by hand.", "A scheduled agent ships + verifies the canary."],
    ["I bump dependencies one PR at a time.", "A weekly agent opens + tests the bumps."],
    ["I write boilerplate handlers all morning.", "A skill scaffolds the whole endpoint."],
    ["I grep logs manually when prod hiccups.", "An agent triages the alert and pages me."],
  ],
  frontend: [
    ["I eyeball every visual diff myself.", "A hook screenshots + flags regressions."],
    ["I hand-write the same form validation.", "A skill generates the schema + tests."],
    ["I copy components and tweak by hand.", "An agent refactors against the design tokens."],
    ["I manually check a11y before merge.", "A pre-commit hook runs the a11y sweep."],
  ],
  fullstack: [
    ["I context-switch and lose the thread.", "Agents hold context across the stack now."],
    ["I write the API and the client twice.", "One skill generates both from the spec."],
    ["I do release notes by scrolling git log.", "A scheduled agent drafts the changelog."],
    ["I do code review reading line by line.", "A review agent pre-flags the real risks."],
  ],
  infra: [
    ["I apply Terraform and pray.", "A hook plans + policy-checks every change."],
    ["I rotate secrets on a calendar reminder.", "A scheduled agent rotates + verifies them."],
    ["I chase flaky CI by re-running jobs.", "An agent quarantines + files the flakes."],
    ["I hand-tune dashboards after incidents.", "A skill generates the runbook + alerts."],
  ],
  ml: [
    ["I re-run notebooks to refresh numbers.", "A scheduled job re-trains + reports nightly."],
    ["I copy eval results into slides by hand.", "An agent builds the eval report each run."],
    ["I label edge cases one by one.", "A skill pre-labels and I just confirm."],
    ["I diff model outputs in my head.", "A hook scores every PR against the eval set."],
  ],
  lead: [
    ["I write status updates from memory.", "An agent drafts the update from the PRs."],
    ["I prep standup by scrolling Slack.", "A scheduled digest lands before standup."],
    ["I review every PR myself, slowly.", "Review agents triage; I focus on the hard ones."],
    ["I track risk in a spreadsheet by hand.", "An agent surfaces stalled work automatically."],
  ],
};
function seedPeople() {
  // distribution across the 6 functions (~26 total)
  const dist = ['backend','backend','backend','backend','backend',
    'frontend','frontend','frontend','frontend',
    'fullstack','fullstack','fullstack','fullstack',
    'infra','infra','infra','infra',
    'ml','ml','ml','ml',
    'lead','lead','lead','lead','lead'];
  const rnd = mulberry32(20260624);
  const seen = {};
  return dist.map((fn, i) => {
    const pre  = Math.round(6  + rnd() * 26);          // 6–32  (manual toil)
    const post = Math.round(70 + rnd() * 26);          // 70–96 (automated)
    const k = seen[fn] = (seen[fn] ?? -1) + 1;
    const r = RESP[fn][k % RESP[fn].length];
    return { id: i + 1, fn, pre, post, t: i, preQ: r[0], postQ: r[1] };
  });
}
// themes span the pre buckets (timesink/friction/goal) and post buckets (built/next)
const THEMES = [
  { id:'t0', q:'timesink', label:'Manual test runs',     count:7, quote:"I hand-run the same suite all day — it eats my mornings." },
  { id:'t1', q:'timesink', label:'Deploy babysitting',   count:6, quote:"Every release is me, a terminal, and my fingers crossed." },
  { id:'t2', q:'timesink', label:'Boilerplate by hand',  count:5, quote:"I keep writing the same handler, the same form, the same migration." },
  { id:'r1', q:'friction', label:'Code review backlog',  count:6, quote:"Reviews pile up and I read every diff line by line." },
  { id:'r2', q:'friction', label:'Flaky CI',             count:5, quote:"I lose an hour a day just re-running flaky jobs." },
  { id:'r3', q:'friction', label:'Dependency bumps',     count:4, quote:"Bumping deps is a chore I always put off until it bites." },
  { id:'g1', q:'goal',     label:'Status & standup prep',count:6, quote:"I want my status update written before I even open Slack." },
  { id:'g2', q:'goal',     label:'Auto-triage alerts',   count:5, quote:"I'd love an agent that triages the page before it wakes me." },
  { id:'b1', q:'built',    label:'Test hook on edit',    count:8, quote:"I wired a hook that runs the affected tests on every save." },
  { id:'b2', q:'built',    label:'Review agent',         count:6, quote:"A review agent now pre-flags the real risks before I look." },
  { id:'b3', q:'built',    label:'Scheduled changelog',  count:5, quote:"A scheduled agent drafts the changelog from merged PRs." },
  { id:'n1', q:'next',     label:'Nightly dep bumps',    count:6, quote:"Next: a weekly agent that opens and tests dependency bumps." },
  { id:'n2', q:'next',     label:'Canary deploy agent',  count:5, quote:"Next: an agent that ships the canary and verifies it for me." },
  { id:'n3', q:'next',     label:'Secret rotation cron', count:4, quote:"Next: a scheduled task that rotates and verifies our secrets." },
];
// automations the room has built — ranked by hours/week saved
const AUTOMATIONS = [
  { id:'a0', type:'hook',     title:'Tests + lint on every edit',   count:18, hours:54 },
  { id:'a1', type:'hook',     title:'Review agent pre-flags risks', count:12, hours:40 },
  { id:'a2', type:'schedule', title:'Nightly dependency bumps',     count:10, hours:22 },
  { id:'a3', type:'schedule', title:'Standup digest before 9am',    count:14, hours:18 },
  { id:'a4', type:'hook',     title:'Visual-diff screenshots',      count:7,  hours:14 },
  { id:'a5', type:'schedule', title:'Canary deploy + verify',       count:6,  hours:12 },
  { id:'a6', type:'schedule', title:'Weekly changelog draft',       count:9,  hours:8  },
];
const ICON = { hook: '⚡', schedule: '🗓' };
const HEADLINE = 'The room automated its toil away';
const PRE_HEADLINE = 'Where the room walked in';

/* hours/week reclaimed: rough model — each migrated point of leverage frees a
   sliver of an engineer's week. Used only when the API omits hoursReclaimed. */
function estHours(people) {
  return Math.round(d3.sum(people, p => Math.max(0, (p.post - p.pre)) * 0.085));
}

/* ── compute aggregate board state from arrived submissions ───────────────── */
function synth(people, themes, automations, hoursOverride) {
  const n = people.length;
  if (!n) return { voices:0, pre:0, post:0, delta:0, hoursReclaimed:0,
                   people:[], functions:[], themes:[], automations:[], headline:'',
                   aiNative:{before:0,after:0,delta:0,scored:0} };
  const pre  = Math.round(d3.mean(people, d => d.pre));
  const post = Math.round(d3.mean(people, d => d.post));
  const functions = FN_ORDER.map(key => {
    const grp = people.filter(p => p.fn === key);
    if (!grp.length) return { key, ...FN_META[key], pre:0, post:0, delta:0, count:0 };
    const fp = Math.round(d3.mean(grp, d => d.pre));
    const fq = Math.round(d3.mean(grp, d => d.post));
    return { key, ...FN_META[key], pre:fp, post:fq, delta:fq - fp, count:grp.length };
  });
  const hoursReclaimed = hoursOverride != null ? hoursOverride : estHours(people);
  const autos = (automations || []).slice().sort((a, b) => b.hours - a.hours);
  return { voices:n, pre, post, delta:post - pre, hoursReclaimed,
           people, functions, themes, automations:autos, headline:HEADLINE,
           aiNative:{before:0,after:0,delta:0,scored:0} };
}

/* ── live feed: drip seeded submissions, or poll a real worker (?api=) ────── */
function makeFeed() {
  const all = seedPeople();
  let arrived = 0, timer = null;
  // ?sim forces the built-in simulator. Otherwise default to same-origin so the
  // worker-served board shows real data; ?api=<url> overrides.
  const _qp = new URLSearchParams(location.search);
  const api = _qp.has('sim') ? null : (_qp.get('api') || (location.protocol.startsWith('http') ? location.origin : null));
  const themesFor = (k) => {
    // reveal themes progressively as the room fills
    const frac = k / all.length;
    return THEMES.filter(t => t.count <= Math.max(2, Math.round(frac * 9)) || frac > .7)
                 .map(t => ({ ...t, count: Math.max(1, Math.round(t.count * Math.min(1, frac + .15))) }));
  };
  const autosFor = (k) => {
    const frac = k / all.length;
    return AUTOMATIONS.filter((a, i) => i < Math.max(1, Math.round(frac * AUTOMATIONS.length)))
                      .map(a => ({ ...a, count: Math.max(1, Math.round(a.count * Math.min(1, frac + .2))),
                                          hours: Math.max(1, Math.round(a.hours * Math.min(1, frac + .2))) }));
  };
  const state = () => {
    const full = arrived >= all.length;
    return synth(all.slice(0, arrived),
                 full ? THEMES : themesFor(arrived),
                 full ? AUTOMATIONS : autosFor(arrived));
  };
  return {
    api, total: all.length,
    get arrived() { return arrived; },
    fill()  { arrived = all.length; return state(); },
    empty() { arrived = 0; return state(); },
    one()   { arrived = Math.min(all.length, arrived + 1); return state(); },
    state,
    startDrip(onTick, every = 1400) {
      clearInterval(timer);
      timer = setInterval(() => {
        if (arrived >= all.length) { clearInterval(timer); return; }
        arrived++; onTick(state());
      }, every);
    },
    stopDrip() { clearInterval(timer); },
    async poll(onData) {
      if (!api) return false;
      try {
        const r = await fetch(api.replace(/\/$/, '') + '/api/board', { cache: 'no-store' });
        if (!r.ok) throw 0;
        onData(normalizeApi(await r.json())); return true;
      } catch (e) { return false; }
    },
  };
}
// map a real worker payload onto our internal shape (defensive)
function normalizeApi(j) {
  const people = (j.people || []).map((p, i) => ({ id: p.id ?? i, fn: FN_META[p.fn || p.function] ? (p.fn || p.function) : 'backend',
    pre: +p.pre || 0, post: +p.post || 0, t: i, preQ: p.preQ || '', postQ: p.postQ || '' }));
  const themes = (j.themes || []).map(t => ({ id: t.id, q: t.question || t.q, label: t.label,
    count: +t.count || 1, quote: t.quote || '' }));
  const automations = (j.automations || []).map((a, i) => ({ id: a.id ?? ('a' + i),
    type: a.type === 'schedule' ? 'schedule' : 'hook', title: a.title || '',
    count: +a.count || 0, hours: +a.hours || 0 }));
  const hours = j.aggregate && j.aggregate.hoursReclaimed != null ? +j.aggregate.hoursReclaimed : null;
  const s = synth(people, themes, automations, hours);
  if (j.headline) s.headline = j.headline;
  if (j.aggregate) Object.assign(s, { pre:+j.aggregate.pre, post:+j.aggregate.post,
    delta:+j.aggregate.delta, voices:+j.aggregate.voices || people.length });
  if (j.aggregate && j.aggregate.aiNative) {
    const ai = j.aggregate.aiNative;
    s.aiNative = { before: +ai.before || 0, after: +ai.after || 0,
      delta: +ai.delta || 0, scored: +ai.scored || 0 };
  }
  return s;
}

/* ── tiny seeded RNG ───────────────────────────────────────────────────────*/
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

/* ════════════════════════════ RENDER ═════════════════════════════════════ */
const TW = readTweaks();
let DATA = null, PHASE = 'pre', AUTO = false, autoTimer = null, autoSpot = null, spotIdx = 0;
let surgeArmed = false; // the hero rides its arcs only on a Walking-in→Now transition, never on a data refresh

/* hero scales / layout caches */
const hero = { svg:null, w:0, h:0, x:null, base:0, dotR:11, pre:new Map(), post:new Map() };

function init() {
  buildFunctionRows();
  setupHero();
  wireControls();
  wireKeys();
  $('#hero').addEventListener('click', (e) => {
    if (e.target.tagName !== 'circle' && pinDot != null) { pinDot = null; unfocusPerson(); }
  });
  buildTweaksPanel();
  scaleStage(); window.addEventListener('resize', () => { scaleStage(); setupHero(); render(true); });

  const feed = makeFeed();
  window.__feed = feed;

  if (feed.api) {
    $('#live-text').textContent = 'Live · ' + feed.api.replace(/^https?:\/\//, '');
    $('#live').classList.remove('sim');
    let gotLive = false, liveTimer = null;
    const tick = async () => {
      const ok = await feed.poll(d => { DATA = d; gotLive = true; render(); });
      // Resilience: once we've shown real data, keep the last-good board on a failed
      // poll (flaky venue Wi-Fi) instead of snapping back to the simulator.
      if (!ok && !gotLive) { DATA = feed.state(); render(); }
    };
    tick(); liveTimer = setInterval(tick, 2500);
    // Let the f/e preview keys take manual control during rehearsal: stop polling so
    // a manual fill/empty isn't stomped by the next live poll (e.g. an empty room → 0).
    feed.pauseLive = () => {
      if (liveTimer == null) return;
      clearInterval(liveTimer); liveTimer = null;
      $('#live-text').textContent = 'Preview · paused (reload for live)';
      $('#live').classList.add('sim');
    };
  } else {
    // demo: open mid-fill so it looks alive, then keep dripping toward full
    DATA = feed.one(); for (let i=0;i<15;i++) DATA = feed.one();
    render(true);
    feed.startDrip(d => { DATA = d; render(); }, 1600);
  }
  applyTweaks();
  // verification hook: instant phase jump (no animation), for screenshots/PDF
  window.__aie = { jump(p){ PHASE = p;
    document.querySelectorAll('#controls .ctl').forEach(c => c.classList.toggle('active',
      (p!=='pre' && c.dataset.action==='now') || (p==='pre' && c.dataset.action==='walking')));
    if (p==='now') CUR=null; render(true); } };
}

/* ── masthead: function dumbbell rows (pre → post leverage) ─────────────────*/
function buildFunctionRows() {
  const wrap = $('#functions'); wrap.innerHTML = '';
  FN_ORDER.forEach(key => {
    const m = FN_META[key];
    const row = document.createElement('div'); row.className = 'fn-row'; row.dataset.fn = key;
    row.innerHTML = `<div class="fn-name">${m.label}</div>
      <div class="fn-track"><svg width="100%" height="38" preserveAspectRatio="none"></svg></div>
      <div class="fn-delta">—</div>`;
    wrap.appendChild(row);
  });
}
function renderFunctions() {
  const colors = paletteColors();
  DATA.functions.forEach(f => {
    const row = $(`.fn-row[data-fn="${f.key}"]`); if (!row) return;
    const c = colors[f.key];
    const svg = d3.select(row).select('svg');
    const W = row.querySelector('.fn-track').clientWidth || 300, H = 38, padL = 4, padR = 8;
    const x = d3.scaleLinear().domain([0,100]).range([padL, W - padR]);
    const yc = H/2;
    svg.attr('viewBox', `0 0 ${W} ${H}`).selectAll('*').remove();
    // baseline track
    svg.append('line').attr('x1',x(0)).attr('x2',x(100)).attr('y1',yc).attr('y2',yc)
      .attr('stroke','var(--line)').attr('stroke-width',3).attr('stroke-linecap','round');
    const showPost = PHASE !== 'pre' && f.count;
    // connector pre→post (end-state set directly so it's correct when paused/exported)
    svg.append('line').attr('x1',x(f.pre)).attr('y1',yc).attr('y2',yc)
      .attr('stroke',c).attr('stroke-width',5).attr('stroke-linecap','round')
      .attr('x2', showPost ? x(f.post) : x(f.pre)).attr('opacity', showPost ? 1 : .9);
    // pre marker (hollow)
    svg.append('circle').attr('cx',x(f.pre)).attr('cy',yc).attr('r',6)
      .attr('fill','var(--bg-1)').attr('stroke',c).attr('stroke-width',2.5).attr('opacity',f.count?1:.3);
    // post marker (filled)
    svg.append('circle').attr('cy',yc).attr('r',7).attr('fill',c)
      .attr('cx', showPost ? x(f.post) : x(f.pre)).attr('opacity', showPost ? 1 : 0);
    row.querySelector('.fn-delta').textContent = showPost && f.count ? '+' + f.delta : (f.count ? '·' : '');
    row.querySelector('.fn-delta').style.color = (showPost && f.delta>0) ? c : 'var(--ink-dim)';
  });
}

/* ── hero: density bloom + migrating beeswarm + arc trails ──────────────────*/
function setupHero() {
  const el = $('#hero'); hero.w = el.clientWidth; hero.h = el.clientHeight;
  hero.svg = d3.select('#hero-svg').attr('viewBox', `0 0 ${hero.w} ${hero.h}`);
  hero.svg.selectAll('*').remove();
  const m = { l: 30, r: 30, b: 56, t: 26 };
  hero.base = hero.h - m.b;
  hero.top = m.t;
  hero.x = d3.scaleLinear().domain([0,100]).range([m.l, hero.w - m.r]);
  // layer order (back → front)
  ['bloom','ridge','axis','trail','marker','dots'].forEach(g => hero.svg.append('g').attr('class', 'L-' + g));
  // defs: gradients + glow
  const defs = hero.svg.append('defs');
  // radial blooms — cool "toil" density (left) and accent "automation" density (right)
  const wb = defs.append('radialGradient').attr('id','accBloom');
  wb.append('stop').attr('offset','0%').attr('stop-color','var(--acc)').attr('stop-opacity',.40);
  wb.append('stop').attr('offset','45%').attr('stop-color','var(--acc)').attr('stop-opacity',.13);
  wb.append('stop').attr('offset','100%').attr('stop-color','var(--acc)').attr('stop-opacity',0);
  const cb = defs.append('radialGradient').attr('id','coolBloom');
  cb.append('stop').attr('offset','0%').attr('stop-color','#7d8b9a').attr('stop-opacity',.30);
  cb.append('stop').attr('offset','50%').attr('stop-color','#8c98a6').attr('stop-opacity',.1);
  cb.append('stop').attr('offset','100%').attr('stop-color','#8c98a6').attr('stop-opacity',0);
  // axis labels — toil → automated
  const ax = hero.svg.select('.L-axis');
  ax.append('line').attr('x1',m.l).attr('x2',hero.w-m.r).attr('y1',hero.base+1).attr('y2',hero.base+1)
    .attr('stroke','var(--line)').attr('stroke-width',1.5);
  const labs = [['Manual toil',.0,'start'],['Half-automated',.5,'middle'],['Automated',1,'end']];
  labs.forEach(([t,p,anchor]) => {
    ax.append('text').attr('x', p===0?m.l : p===1?hero.w-m.r : hero.x(50)).attr('y', hero.base+34)
      .attr('text-anchor',anchor).attr('fill','var(--ink-dim)')
      .style('font-family','var(--font-mono)').style('font-size','17px').style('letter-spacing','.16em')
      .style('text-transform','uppercase').text(t);
  });
}
function kde(data, bw=6.5){
  const epan = v => { v/=bw; return Math.abs(v)<=1 ? .75*(1-v*v)/bw : 0; };
  const X = d3.range(0,101,1);
  return X.map(t => [t, d3.mean(data, d => epan(t - d)) || 0]);
}
function computeBeeswarm(accessor) {
  const r = hero.dotR;
  const col = 2*r + 1.5;                       // bin to columns so dots stack into mounds
  const nodes = DATA.people.map((p,i) => {
    const px = hero.x(accessor(p));
    return { id:p.id, fn:p.fn, tx: Math.round(px/col)*col, y: hero.base - r - (i%5)*2 };
  });
  const sim = d3.forceSimulation(nodes)
    .force('x', d3.forceX(d => d.tx).strength(1))
    .force('y', d3.forceY(hero.base - r - 1).strength(.045))
    .force('c', d3.forceCollide(r + 0.7).strength(1))
    .stop();
  for (let i=0;i<300;i++) sim.tick();
  const out = new Map();
  nodes.forEach(n => out.set(n.id, { x:n.x, y: Math.max(hero.top + r, Math.min(n.y, hero.base - r - 1)), fn:n.fn }));
  return out;
}
// arc path for a person's journey (shared by the trail render + the riding tween)
function arcPathString(d) {
  const a = hero.pre.get(d.id), b = hero.post.get(d.id);
  if (!a || !b) return null;
  const mx = (a.x + b.x)/2, span = Math.abs(b.x - a.x);
  const my = Math.max(hero.top + 6, hero.base - 92 - span*0.30);
  return d3.line().curve(d3.curveBasis)([[a.x,a.y],[mx,my],[b.x,b.y]]);
}
function renderHero(instant) {
  if (!DATA.people.length) { $('#hero-empty').style.display='flex'; $('#hero-svg').style.opacity=0;
    $('#he-count').textContent = (window.__feed?.arrived||0)+' opted in'; return; }
  $('#hero-empty').style.display='none'; $('#hero-svg').style.opacity=1;
  hero.dotR = +TW.dotSize;
  hero.pre  = computeBeeswarm(p => p.pre);
  hero.post = computeBeeswarm(p => p.post);
  const colors = paletteColors();

  // cluster centers + room averages (for blooms & markers)
  const meanX = mp => d3.mean([...mp.values()], d=>d.x);
  const preCx = meanX(hero.pre), postCx = meanX(hero.post);
  const preAvg = Math.round(d3.mean(DATA.people, d=>d.pre));
  const postAvg = Math.round(d3.mean(DATA.people, d=>d.post));

  // BLOOM — cool "toil" wash (left) → accent "automation" wash (right)
  const bloomData = [
    { cls:'cool', cx:preCx,  fill:'url(#coolBloom)', op: PHASE==='pre' ? 1 : .22 },
    { cls:'acc',  cx:postCx, fill:'url(#accBloom)',  op: PHASE==='pre' ? 0 : 1 },
  ];
  const bsel = hero.svg.select('.L-bloom').selectAll('ellipse').data(bloomData, d=>d.cls);
  bsel.enter().append('ellipse').merge(bsel)
    .attr('cx', d=>d.cx).attr('cy', hero.base - 36)
    .attr('rx', 380).attr('ry', 250).attr('fill', d=>d.fill).attr('opacity', d=>d.op);

  // RIDGES — optional KDE backdrop (off by default)
  const ridge = hero.svg.select('.L-ridge');
  if (TW.ridges) {
    const yMax = d3.max([...kde(DATA.people.map(d=>d.pre)), ...kde(DATA.people.map(d=>d.post))], d=>d[1]) || 1;
    const ay = d3.scaleLinear().domain([0,yMax]).range([hero.base, hero.top + 40]);
    const area = d3.area().x(d=>hero.x(d[0])).y0(hero.base).y1(d=>ay(d[1])).curve(d3.curveBasis);
    const rd = [
      { cls:'cool', d:kde(DATA.people.map(d=>d.pre)),  stroke:'#9aa6b2' },
      { cls:'acc',  d:kde(DATA.people.map(d=>d.post)), stroke:'var(--acc)' },
    ];
    const rsel = ridge.selectAll('path').data(rd, d=>d.cls);
    rsel.exit().remove();
    rsel.enter().append('path').attr('fill','none').attr('stroke-width',2)
      .merge(rsel).attr('d', d=>area(d.d)).attr('stroke', d=>d.stroke)
      .attr('stroke-opacity', d => PHASE==='pre' ? (d.cls==='cool'?.45:.1) : (d.cls==='cool'?.22:.55));
  } else { ridge.selectAll('path').remove(); }

  // ARCS — the journeys. On the surge each dev traces a glowing trail from
  // toil→leverage; together they read as one current crossing the room.
  const trail = hero.svg.select('.L-trail');
  const tsel = trail.selectAll('path').data((TW.trails && PHASE!=='pre') ? DATA.people : [], d=>d.id);
  tsel.exit().remove();
  const tall = tsel.enter().append('path').attr('fill','none').attr('stroke-linecap','round')
    .merge(tsel)
      .attr('stroke', d => colors[d.fn]).attr('stroke-width', 2.2)
      .attr('d', d => arcPathString(d))
      .attr('stroke-opacity', .46)
      .style('filter', d => `drop-shadow(0 0 4px ${colors[d.fn]}aa)`)
      .attr('data-fn', d => d.fn);
  // draw the arcs ON during a live surge; instant render shows them fully drawn
  const n = DATA.people.length;
  tall.each(function (d, i) {
    const L = this.getTotalLength ? this.getTotalLength() : 0;
    if (!instant && PHASE==='now' && surgeArmed && L) {
      d3.select(this).attr('stroke-dasharray', L).attr('stroke-dashoffset', L)
        .transition().duration(surgeDur()).delay(surgeDelay(i,n)).ease(d3.easeCubicInOut)
        .attr('stroke-dashoffset', 0)
        .on('end', function(){ d3.select(this).attr('stroke-dasharray', null).attr('stroke-dashoffset', null); });
    } else {
      d3.select(this).attr('stroke-dasharray', null).attr('stroke-dashoffset', null);
    }
  });

  // AVG MARKERS — the room's centre of gravity, on the axis
  const markers = PHASE==='pre'
    ? [{ x:hero.x(preAvg), v:preAvg, c:'var(--ink-soft)', lab:'AVG' }]
    : [{ x:hero.x(preAvg), v:preAvg, c:'var(--ink-dim)', lab:'WAS', ghost:true },
       { x:hero.x(postAvg), v:postAvg, c:'var(--acc)', lab:'NOW' }];
  const mlayer = hero.svg.select('.L-marker');
  const msel = mlayer.selectAll('g.mk').data(markers, d=>d.lab);
  msel.exit().remove();
  const ment = msel.enter().append('g').attr('class','mk');
  ment.append('line'); ment.append('text').attr('class','mv'); ment.append('text').attr('class','ml');
  const topY = hero.base - 168;
  const mm = ment.merge(msel).attr('transform', d=>`translate(${d.x},0)`).attr('opacity', d=>d.ghost?.7:1);
  mm.select('line').attr('x1',0).attr('x2',0).attr('y1',hero.base).attr('y2',topY+10)
    .attr('stroke', d=>d.c).attr('stroke-width',1.5).attr('stroke-dasharray', d=>d.ghost?'2 5':'none');
  mm.select('.mv').attr('x',0).attr('y',topY).attr('text-anchor','middle').attr('fill',d=>d.c)
    .style('font-family','var(--font-serif)').style('font-weight',700).style('font-size','30px').text(d=>d.v);
  mm.select('.ml').attr('x',0).attr('y',topY-26).attr('text-anchor','middle').attr('fill',d=>d.c)
    .style('font-family','var(--font-mono)').style('font-size','12px').style('letter-spacing','.2em').text(d=>d.lab);

  // dots
  const layout = PHASE==='pre' ? hero.pre : hero.post;
  const dots = hero.svg.select('.L-dots');
  const sel = dots.selectAll('circle').data(DATA.people, d=>d.id);
  sel.exit().transition().duration(300).attr('r',0).remove();
  const ent = sel.enter().append('circle')
    .attr('r', 0).attr('fill', d=>colors[d.fn])
    .attr('stroke','rgba(8,12,18,.55)').attr('stroke-width',1.5)
    .attr('cx', d=>(hero.pre.get(d.id)||{x:hero.x(d.pre)}).x)
    .attr('cy', d=>(hero.pre.get(d.id)||{y:hero.base}).y)
    .style('filter','drop-shadow(0 1px 4px rgba(0,0,0,.45))');
  const all = ent.merge(sel);
  all.attr('fill', d=>colors[d.fn]).attr('stroke', PHASE==='pre' ? 'rgba(8,12,18,.5)' : 'rgba(255,255,255,.28)')
     .style('cursor','pointer').attr('data-id', d=>d.id)
     .on('mouseenter', function(e,d){ if(pinDot==null) focusPerson(d); })
     .on('mouseleave', function(){ if(pinDot==null) unfocusPerson(); })
     .on('click', function(e,d){ e.stopPropagation(); if(pinDot===d.id){ pinDot=null; unfocusPerson(); } else { pinDot=d.id; focusPerson(d); } });
  const cx = d => (layout.get(d.id)||{x:0}).x, cy = d => (layout.get(d.id)||{y:0}).y;
  if (instant) {
    all.interrupt().attr('r', hero.dotR).attr('cx', cx).attr('cy', cy);
  } else if (PHASE==='now' && surgeArmed) {
    // ride the arc — each dev flies along its own journey curve as the trail draws on.
    // Fires ONCE on the Walking-in→Now transition; data refreshes fall through below.
    all.transition().duration(surgeDur()).delay((d,i)=>surgeDelay(i, DATA.people.length))
      .ease(d3.easeCubicInOut).attr('r', hero.dotR)
      .attrTween('cx', d=>{ const r=makeRider(d); return r ? (t=>String(r(t)[0])) : null; })
      .attrTween('cy', d=>{ const r=makeRider(d); return r ? (t=>String(r(t)[1])) : null; })
      .on('end', function(d){ d3.select(this).attr('cx', cx(d)).attr('cy', cy(d)); });
    surgePop(all);
    surgeArmed = false;
  } else {
    all.transition().duration(surgeDur()).delay((d,i)=>surgeDelay(i, DATA.people.length))
      .ease(d3.easeCubicInOut).attr('r', hero.dotR).attr('cx', cx).attr('cy', cy);
  }
  if (pinDot != null && layout.get(pinDot)) focusPerson(DATA.people.find(p=>p.id===pinDot));
}
function makeRider(d){
  const ds = arcPathString(d); if(!ds) return null;
  const p = document.createElementNS('http://www.w3.org/2000/svg','path'); p.setAttribute('d', ds);
  let L = 0; try { L = p.getTotalLength(); } catch(e){ return null; }
  if (!L) return null;
  return t => { const pt = p.getPointAtLength(t*L); return [pt.x, pt.y]; };
}

/* ── per-person drill-down — the real captured workflow behind one dot ──────*/
let pinDot = null;
function focusPerson(d){
  if(!d) return;
  const layout = PHASE==='pre' ? hero.pre : hero.post; const pos = layout.get(d.id); if(!pos) return;
  const colors = paletteColors(); const c = colors[d.fn]; const m = FN_META[d.fn];
  hero.svg.select('.L-dots').selectAll('circle')
    .attr('opacity', x => x.id===d.id ? 1 : .2)
    .attr('r', x => x.id===d.id ? hero.dotR*1.5 : hero.dotR)
    .attr('stroke', x => x.id===d.id ? '#fff' : 'rgba(255,255,255,.28)')
    .attr('stroke-width', x => x.id===d.id ? 3.5 : 1.5);
  hero.svg.select('.L-trail').selectAll('path')
    .attr('stroke-opacity', x => x.id===d.id ? .95 : .06)
    .attr('stroke-width', x => x.id===d.id ? 3.2 : 2.2);
  const tip = ensureDotTip();
  const inNow = PHASE!=='pre';
  tip.innerHTML =
    `<div class="dt-top"><span class="dt-chip" style="background:${c}"></span>${m.label}<span class="dt-anon">· anonymous</span></div>`+
    `<div class="dt-move">${ inNow
        ? `walked in <b>${d.pre}</b> &nbsp;→&nbsp; <b style="color:var(--acc)">${d.post}</b><span class="dt-delta">+${d.post-d.pre}</span>`
        : `walking in <b>${d.pre}</b> <span class="dt-of">/ 100</span>` }</div>`+
    `<div class="dt-q">“${ inNow ? d.postQ : d.preQ }”</div>`+
    (pinDot===d.id ? `<div class="dt-pin">click to release</div>` : ``);
  const lx = Math.max(172, Math.min(hero.w-172, pos.x));
  tip.style.left = lx+'px'; tip.style.top = (pos.y - hero.dotR - 10)+'px';
  tip.style.display = 'block';
}
function unfocusPerson(){
  hero.svg.select('.L-dots').selectAll('circle').attr('opacity',1).attr('r',hero.dotR)
    .attr('stroke', PHASE==='pre'?'rgba(8,12,18,.5)':'rgba(255,255,255,.28)').attr('stroke-width',1.5);
  hero.svg.select('.L-trail').selectAll('path').attr('stroke-opacity',.46).attr('stroke-width',2.2);
  const tip = document.getElementById('dot-tip'); if(tip) tip.style.display='none';
}
function ensureDotTip(){
  let t = document.getElementById('dot-tip');
  if(!t){ t = document.createElement('div'); t.id='dot-tip'; $('#hero').appendChild(t); }
  return t;
}
function surgeDur(){ return Math.round(700 + (1 - TW.surge/100)*1100); }       // higher surge = snappier swell
function surgeDelay(i,n){ return Math.round((i/n) * (200 + TW.surge*6)); }
function surgePop(sel){
  sel.transition().delay((d,i)=>surgeDelay(i,DATA.people.length)+surgeDur()*.55)
    .duration(160).attr('r', hero.dotR*1.32).transition().duration(220).ease(d3.easeBackOut.overshoot(1.6))
    .attr('r', hero.dotR);
}

/* ── constellation + spotlight ─────────────────────────────────────────────
   Pre phase shows the toil themes (timesink/friction/goal); Now shows what the
   room built (built/next). Columns swap with the phase. */
function activeGroups() {
  return PHASE === 'pre' ? ['timesink','friction','goal'] : ['built','next'];
}
function renderConstellation() {
  const svg = d3.select('#constellation-svg');
  const W = $('#constellation').clientWidth, H = 212;
  svg.attr('viewBox', `0 0 ${W} ${H}`);
  const groups = activeGroups();
  const colW = W / groups.length;
  const data = [];
  groups.forEach((q, gi) => {
    const items = DATA.themes.filter(t => t.q === q);
    const cx = colW * gi + colW/2, cy = H/2 + 14;
    const pack = d3.pack().size([colW-30, H-46]).padding(5);
    const root = d3.hierarchy({ children: items }).sum(d => d.count);
    pack(root);
    root.leaves().forEach(leaf => data.push({
      ...leaf.data, q, x: cx + (leaf.x - (colW-30)/2), y: cy + (leaf.y - (H-46)/2) - 8, r: leaf.r,
    }));
  });
  // group headers
  const heads = svg.selectAll('text.q-head').data(groups, d=>d);
  heads.exit().remove();
  heads.join('text').attr('class','q-head')
    .attr('x',(d,i)=>colW*i+colW/2).attr('y',16).attr('text-anchor','middle')
    .attr('fill',d=>Q_META[d].color).style('font-family','var(--font-mono)').style('font-size','14px')
    .style('font-weight',700).style('letter-spacing','.16em').style('text-transform','uppercase')
    .text(d=>Q_META[d].label);

  const sel = svg.selectAll('g.bub').data(data, d=>d.id);
  sel.exit().remove();
  const ent = sel.enter().append('g').attr('class','bub').style('cursor','pointer')
    .on('click', (e,d) => spotlight(d, true));
  ent.append('circle').attr('class','b-c');
  ent.append('text').attr('class','b-t').attr('text-anchor','middle').attr('dy','.35em')
    .attr('fill','#04130d').style('font-family','var(--font-mono)').style('font-weight',700);
  const merged = ent.merge(sel);
  merged.attr('transform', d=>`translate(${d.x},${d.y})`);
  merged.select('.b-c')
    .attr('r', d=>d.r).attr('fill', d=>Q_META[d.q].color)
    .attr('fill-opacity', d => (CUR && CUR.id===d.id) ? 1 : .82)
    .attr('stroke', d => (CUR && CUR.id===d.id) ? '#fff' : 'rgba(255,255,255,.35)')
    .attr('stroke-width', d => (CUR && CUR.id===d.id) ? 3 : 1)
    .style('filter', d => (CUR && CUR.id===d.id) ? 'drop-shadow(0 4px 12px rgba(0,0,0,.5))' : 'none');
  merged.select('.b-t').attr('font-size', d=>Math.min(23, Math.max(12, d.r*.66)))
    .attr('fill', d=>d.q==='built'||d.q==='next' ? '#04130d' : '#0d1117')
    .text(d=>'×'+d.count).attr('opacity', d=>d.r>13?1:0);
}
let CUR = null;
function spotlight(d, fromClick) {
  if (!d) return; CUR = d;
  const sp = $('#spotlight'); sp.classList.remove('swap'); void sp.offsetWidth; sp.classList.add('swap');
  sp.style.opacity = 1;
  $('#sp-q').textContent = `${Q_META[d.q].label} · ${d.count} voices`; $('#sp-q').style.color = Q_META[d.q].color;
  $('#sp-title').textContent = d.label;
  $('#sp-quote').textContent = d.quote;
  // legend reflects the themes for the active phase
  const groups = activeGroups();
  $('#sp-legend').innerHTML = groups.map(g =>
    `<span><i style="background:${Q_META[g].color}"></i>${Q_META[g].label}</span>`).join('');
  renderConstellation();
  if (fromClick) { AUTO_SPOT_PAUSE = Date.now() + 9000; }
}
let AUTO_SPOT_PAUSE = 0;
function startAutoSpot() {
  clearInterval(autoSpot);
  autoSpot = setInterval(() => {
    if (Date.now() < AUTO_SPOT_PAUSE || PHASE==='pre' || !DATA || !DATA.themes.length) return;
    const pool = DATA.themes.filter(t => activeGroups().includes(t.q));
    if (!pool.length) return;
    spotIdx = (spotIdx + 1) % pool.length;
    spotlight(pool[spotIdx]);
  }, 4200);
}

/* ── automations panel — ranked cards (hook ⚡ / schedule 🗓) ────────────────*/
function renderAutomations() {
  const wrap = $('#auto-list');
  const list = (DATA.automations || []).slice(0, 6); // already sorted by hours desc in synth()
  const sel = d3.select(wrap).selectAll('div.auto-card').data(list, d=>d.id);
  sel.exit().remove();
  const ent = sel.enter().append('div').attr('class','auto-card');
  ent.append('div').attr('class','auto-icon');
  const body = ent.append('div').attr('class','auto-body');
  body.append('div').attr('class','auto-title');
  body.append('div').attr('class','auto-meta');
  const hrs = ent.append('div').attr('class','auto-hours');
  hrs.append('span').attr('class','hval');
  hrs.append('small').text('h/wk');
  const merged = ent.merge(sel);
  merged.select('.auto-icon').text(d => ICON[d.type] || '⚡');
  merged.select('.auto-title').text(d => d.title);
  merged.select('.auto-meta').html(d => `<span class="at">${d.type}</span> · helps ${d.count}`);
  merged.select('.hval').text(d => d.hours);
  // keep DOM order matching the ranked data
  merged.order();
}

/* ── headline / marquee / phase ────────────────────────────────────────────*/
function renderMasthead(instant) {
  const sparse = (DATA.voices||0) < 3;
  const hl = $('#headline');
  if (sparse) {
    hl.innerHTML = `<span class="hl-faded">Reading<br>the room…</span>`;
    $('#phase-line').classList.remove('is-now'); $('#phase-text').textContent = 'Standing by';
    const num = $('#m-num'); num.textContent = '0'; num.classList.add('pre'); num.dataset.v = 0;
    num.parentElement.style.setProperty('--num-glow', 0);
    $('#m-sub').innerHTML = `${DATA.voices||0} of ${window.__feed?.total||26} opted in`;
    $('#m-label').textContent = 'Engineering-hours/week';
    setGlow(0); return;
  }
  const showNow = PHASE !== 'pre';
  const text = showNow ? (TW.headline || DATA.headline || HEADLINE) : PRE_HEADLINE;
  hl.innerHTML = showNow ? text : `<span class="hl-faded">${text}</span>`;
  $('#phase-line').classList.toggle('is-now', showNow);
  $('#phase-text').textContent = showNow ? (AUTO ? 'Now · auto' : 'Now') : 'Walking in';

  // MARQUEE: hours reclaimed is the hero of the Now phase. In pre we show the
  // current room avg leverage as a muted number; in now we count up the hours.
  const num = $('#m-num'), sub = $('#m-sub'), label = $('#m-label');
  if (showNow) {
    num.classList.remove('pre');
    label.textContent = 'Engineering-hours/week reclaimed';
    animateNum(num, DATA.hoursReclaimed, '', instant);
    sub.innerHTML = `room leverage <b>${DATA.pre} → ${DATA.post}</b> · ${DATA.voices} devs`;
    if (DATA.aiNative && DATA.aiNative.scored > 0) {
      const ai = document.createElement('div');
      ai.className = 'ai-native-line';
      ai.textContent = `AI-Native ${DATA.aiNative.before}% → ${DATA.aiNative.after}% · ${DATA.aiNative.scored} scored`;
      sub.appendChild(ai);
    }
    num.parentElement.style.setProperty('--num-glow', .55);
  } else {
    num.classList.add('pre');
    label.textContent = 'Room leverage · walking in';
    animateNum(num, DATA.pre, '', instant);
    sub.innerHTML = `avg · ${DATA.voices} devs opted in`;
    num.parentElement.style.setProperty('--num-glow', 0);
  }
  setGlow(showNow ? .16 : 0);
}
function animateNum(el, target, prefix, instant) {
  const from = parseInt(el.dataset.v || '0', 10); el.dataset.v = target;
  if (instant) { el.textContent = prefix + target; return; }
  d3.select(el).transition().duration(1100).ease(d3.easeCubicOut).tween('n', () => {
    const i = d3.interpolateRound(from, target); return t => el.textContent = prefix + i(t);
  });
}
function setGlow(v){ document.getElementById('board').style.setProperty('--glow', v); }

/* ── master render ─────────────────────────────────────────────────────────*/
function render(instant) {
  if (!DATA) return;
  const sparse = (DATA.voices||0) < 3;
  document.getElementById('board').classList.toggle('is-empty', sparse);
  renderMasthead(instant);
  renderFunctions();
  renderHero(instant);
  if (sparse) { CUR = null; updateFooter(); return; }
  renderConstellation();
  renderAutomations();
  // default spotlight: in pre, the top timesink; in now, what was built today
  if (!CUR || !activeGroups().includes(CUR.q)) {
    const pool = DATA.themes.filter(t => activeGroups().includes(t.q));
    if (pool.length) spotlight(pool[0]);
  }
  updateFooter();
}
function updateFooter() {
  const t = new Date();
  $('#live-text').textContent = (window.__feed?.api ? 'Live' : 'Simulated feed') +
    ' · ' + (DATA.voices||0) + ' devs · ' + t.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
}

/* ── controls / phases ─────────────────────────────────────────────────────*/
function setPhase(p) {
  if (p === 'now' && PHASE !== 'now') surgeArmed = true; // arm the one-time surge
  PHASE = p;
  document.querySelectorAll('#controls .ctl').forEach(c => c.classList.toggle('active',
    (p!=='pre' && c.dataset.action==='now') || (p==='pre' && c.dataset.action==='walking')));
  CUR = null; // force the spotlight/legend to re-pick for the new phase
  render();
}
function toggleAuto() {
  // Auto is a one-shot reveal: surge to "Now" and STAY there (the lower spotlight
  // gently rotates through themes). No back-and-forth cycling.
  AUTO = !AUTO;
  document.querySelector('.ctl[data-action="auto"]').classList.toggle('active', AUTO);
  if (AUTO) setPhase('now'); else render();
}
function wireControls() {
  document.querySelectorAll('#controls .ctl').forEach(c => c.addEventListener('click', () => {
    const a = c.dataset.action;
    if (a==='walking') { AUTO=false; clearInterval(autoTimer); setPhase('pre'); }
    else if (a==='now') { AUTO=false; clearInterval(autoTimer); document.querySelector('.ctl[data-action="auto"]').classList.remove('active'); setPhase('now'); }
    else toggleAuto();
  }));
  startAutoSpot();
}
function wireKeys() {
  window.addEventListener('keydown', e => {
    if (e.key==='ArrowRight') { setPhase('now'); }
    else if (e.key==='ArrowLeft') { setPhase('pre'); }
    else if (e.key===' ') { e.preventDefault(); setPhase(PHASE==='pre'?'now':'pre'); }
    else if (e.key==='a'||e.key==='A') toggleAuto();
    else if (e.key==='e'||e.key==='E') { window.__feed.pauseLive?.(); window.__feed.stopDrip(); DATA = window.__feed.empty(); render(true); }
    else if (e.key==='f'||e.key==='F') { window.__feed.pauseLive?.(); window.__feed.stopDrip(); DATA = window.__feed.fill(); render(true); }
  });
}

/* ── stage scaling ─────────────────────────────────────────────────────────*/
function scaleStage() {
  const s = Math.min(window.innerWidth/1920, window.innerHeight/1080);
  $('#board').style.transform = `translate(-50%,-50%) scale(${s})`;
}

/* ── palette / tweaks ──────────────────────────────────────────────────────*/
function paletteColors() {
  const arr = PALETTES[TW.palette] || PALETTES.Terminal;
  const o = {}; FN_ORDER.forEach((k,i)=> o[k]=arr[i]); return o;
}
function applyTweaks() {
  document.getElementById('board').style.setProperty('--acc', TW.acc);
  document.getElementById('board').style.setProperty('--grain', TW.grain);
  if (DATA) render(true);
}
function readTweaks() {
  const d = { surge:60, dotSize:14, autoPace:7, headline:'', palette:'Terminal',
    acc:'#16c391', grain:.35, ridges:false, trails:true };
  try { return Object.assign(d, JSON.parse(localStorage.getItem('aie_tweaks')||'{}')); }
  catch(e){ return d; }
}
function saveTweaks(){ try{ localStorage.setItem('aie_tweaks', JSON.stringify(TW)); }catch(e){} }

/* vanilla Tweaks panel (host edit-mode protocol) */
function buildTweaksPanel() {
  const css = document.createElement('style');
  css.textContent = `
  #twk{position:fixed;right:16px;bottom:16px;z-index:9999;width:266px;display:none;flex-direction:column;
    background:rgba(20,27,38,.92);backdrop-filter:blur(20px) saturate(150%);
    border:1px solid rgba(54,214,166,.28);border-radius:14px;box-shadow:0 16px 44px rgba(0,0,0,.55);
    font-family:var(--font-sans);color:#e8edf4;overflow:hidden}
  #twk.open{display:flex}
  #twk .hd{display:flex;justify-content:space-between;align-items:center;padding:12px 12px 10px 16px;cursor:move}
  #twk .hd b{font-size:13px;letter-spacing:.02em}
  #twk .hd button{border:0;background:transparent;font-size:15px;cursor:pointer;color:#8aa0b4}
  #twk .bd{padding:0 16px 16px;display:flex;flex-direction:column;gap:13px;max-height:78vh;overflow:auto}
  #twk .sect{font-family:var(--font-mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#5fb0b8;margin-top:6px}
  #twk label.r{display:flex;flex-direction:column;gap:6px;font-size:12px}
  #twk .lr{display:flex;justify-content:space-between;color:#a8b4c4}
  #twk input[type=range]{width:100%;accent-color:var(--acc)}
  #twk input[type=text]{width:100%;padding:6px 8px;border:1px solid rgba(54,214,166,.3);border-radius:7px;background:rgba(8,12,18,.6);color:#e8edf4;font:inherit}
  #twk .seg{display:flex;gap:4px;flex-wrap:wrap}
  #twk .seg button{flex:1;min-width:46px;padding:6px 4px;border:1px solid rgba(54,214,166,.25);border-radius:7px;background:rgba(8,12,18,.5);color:#cdd6e0;font:inherit;font-size:11px;cursor:pointer}
  #twk .seg button.on{background:var(--acc);border-color:var(--acc);color:#04130d}
  #twk .sw{display:flex;gap:6px}#twk .sw button{width:26px;height:26px;border-radius:50%;border:2px solid rgba(255,255,255,.14);cursor:pointer}
  #twk .sw button.on{border-color:#fff;box-shadow:0 0 0 2px #0d1117 inset}
  #twk .tog{display:flex;justify-content:space-between;align-items:center;font-size:12px}
  #twk .tog input{width:34px;height:20px;accent-color:var(--acc)}`;
  document.head.appendChild(css);
  const p = document.createElement('div'); p.id='twk';
  p.innerHTML = `<div class="hd"><b>Tweaks</b><button id="twk-x">✕</button></div><div class="bd"></div>`;
  document.body.appendChild(p);
  const bd = p.querySelector('.bd');
  const sect = t => { const s=document.createElement('div'); s.className='sect'; s.textContent=t; bd.appendChild(s); };

  sect('Motion');
  mkSlider(bd,'Surge intensity','surge',0,100,1,()=>render());
  mkSlider(bd,'Auto pace (sec)','autoPace',4,15,1);
  sect('Hero');
  mkSlider(bd,'Dot size','dotSize',7,16,1,()=>render(true));
  mkToggle(bd,'Density ridges','ridges',()=>render(true));
  mkToggle(bd,'Journey trails','trails',()=>render(true));
  sect('Brand');
  mkText(bd,'Headline (Now)','headline',()=>render());
  mkSeg(bd,'Function palette','palette',Object.keys(PALETTES),()=>render(true));
  mkSwatch(bd,'Automation accent','acc',['#16c391','#36d6a6','#19b8d6','#36b3ff'],()=>applyTweaks());
  mkSlider(bd,'Grain','grain',0,1,.05,()=>applyTweaks());

  p.querySelector('#twk-x').onclick = () => { p.classList.remove('open'); window.parent.postMessage({type:'__edit_mode_dismissed'},'*'); };
  dragify(p, p.querySelector('.hd'));
  window.addEventListener('message', e => {
    const t=e?.data?.type;
    if (t==='__activate_edit_mode') p.classList.add('open');
    else if (t==='__deactivate_edit_mode') p.classList.remove('open');
  });
  window.parent.postMessage({type:'__edit_mode_available'},'*');
}
function mkSlider(bd,label,key,min,max,step,after){
  const w=document.createElement('label'); w.className='r';
  w.innerHTML=`<span class="lr"><span>${label}</span><span class="v">${TW[key]}</span></span><input type="range" min="${min}" max="${max}" step="${step}" value="${TW[key]}">`;
  const inp=w.querySelector('input'), v=w.querySelector('.v');
  inp.oninput=()=>{ TW[key]=+inp.value; v.textContent=inp.value; saveTweaks(); after&&after(); };
  bd.appendChild(w);
}
function mkToggle(bd,label,key,after){
  const w=document.createElement('div'); w.className='tog';
  w.innerHTML=`<span>${label}</span><input type="checkbox" ${TW[key]?'checked':''}>`;
  w.querySelector('input').onchange=e=>{ TW[key]=e.target.checked; saveTweaks(); after&&after(); };
  bd.appendChild(w);
}
function mkText(bd,label,key,after){
  const w=document.createElement('label'); w.className='r';
  w.innerHTML=`<span>${label}</span><input type="text" value="${TW[key]||''}" placeholder="The room automated its toil away">`;
  w.querySelector('input').oninput=e=>{ TW[key]=e.target.value; saveTweaks(); after&&after(); };
  bd.appendChild(w);
}
function mkSeg(bd,label,key,opts,after){
  const w=document.createElement('label'); w.className='r';
  w.innerHTML=`<span>${label}</span><div class="seg">${opts.map(o=>`<button data-o="${o}" class="${TW[key]===o?'on':''}">${o}</button>`).join('')}</div>`;
  w.querySelectorAll('button').forEach(b=>b.onclick=()=>{ TW[key]=b.dataset.o;
    w.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b)); saveTweaks(); after&&after(); });
  bd.appendChild(w);
}
function mkSwatch(bd,label,key,opts,after){
  const w=document.createElement('label'); w.className='r';
  w.innerHTML=`<span>${label}</span><div class="sw">${opts.map(o=>`<button data-o="${o}" style="background:${o}" class="${TW[key]===o?'on':''}"></button>`).join('')}</div>`;
  w.querySelectorAll('button').forEach(b=>b.onclick=()=>{ TW[key]=b.dataset.o;
    w.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b)); saveTweaks(); after&&after(); });
  bd.appendChild(w);
}
function dragify(panel, handle){
  let sx,sy,ox,oy,drag=false;
  handle.addEventListener('mousedown',e=>{ if(e.target.tagName==='BUTTON')return; drag=true; sx=e.clientX; sy=e.clientY;
    const r=panel.getBoundingClientRect(); ox=r.left; oy=r.top; panel.style.right='auto'; panel.style.bottom='auto'; panel.style.left=ox+'px'; panel.style.top=oy+'px'; });
  window.addEventListener('mousemove',e=>{ if(!drag)return; panel.style.left=(ox+e.clientX-sx)+'px'; panel.style.top=(oy+e.clientY-sy)+'px'; });
  window.addEventListener('mouseup',()=>drag=false);
}

if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
