/**
 * deck-animations.js — entry animations for the deck.
 *
 * Listens for <deck-stage>'s `slidechange` CustomEvent and replays a
 * per-slide entry animation on the now-active slide. Slides are matched
 * by their data-label attribute.
 *
 * Engine: Web Animations API (WAAPI). Zero dependencies, works offline.
 * Reduced motion: deck-animations.css collapses prep states to final.
 *
 * The deck-stage component dispatches slidechange with reason 'init' on
 * first mount, so the cover slide animates on page load.
 */

(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Easing presets ----
  const EASE_OUT_EXPO = 'cubic-bezier(0.16, 1, 0.3, 1)';
  const EASE_OUT_CUBIC = 'cubic-bezier(0.33, 1, 0.68, 1)';
  const EASE_SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)'; // overshoot
  const EASE_STANDARD = 'cubic-bezier(0.4, 0, 0.2, 1)';

  // ---- Helpers ----------------------------------------------------------

  // Cancel any in-flight WAAPI animations on a node tree so we can replay.
  function clearAnims(root) {
    if (!root || !root.getAnimations) return;
    root.getAnimations({ subtree: true }).forEach(a => {
      try { a.cancel(); } catch (e) {}
    });
  }

  function rise(el, opts = {}) {
    if (!el) return;
    const dy = opts.dy ?? 18;
    return el.animate(
      [
        { opacity: 0, transform: `translateY(${dy}px)` },
        { opacity: 1, transform: 'translateY(0)' }
      ],
      {
        duration: opts.duration ?? 520,
        delay: opts.delay ?? 0,
        easing: opts.easing ?? EASE_OUT_EXPO,
        fill: 'both'
      }
    );
  }

  function cascade(els, opts = {}) {
    const out = [];
    els.forEach((el, i) => {
      const fromTransform = opts.x
        ? `translateX(${opts.x}px)`
        : `translateY(${opts.dy ?? 24}px)`;
      const a = el.animate(
        [
          { opacity: 0, transform: fromTransform },
          { opacity: 1, transform: 'translate(0, 0)' }
        ],
        {
          duration: opts.duration ?? 520,
          delay: (opts.baseDelay ?? 0) + i * (opts.stagger ?? 140),
          easing: opts.easing ?? EASE_OUT_EXPO,
          fill: 'both'
        }
      );
      out.push(a);
    });
    return out;
  }

  function paintAccent(el, opts = {}) {
    if (!el) return;
    return el.animate(
      [
        { backgroundSize: '0% 16px' },
        { backgroundSize: '100% 16px' }
      ],
      {
        duration: opts.duration ?? 520,
        delay: opts.delay ?? 0,
        easing: opts.easing ?? EASE_STANDARD,
        fill: 'both'
      }
    );
  }

  function paintAllAccents(slide, baseDelay = 300, stagger = 90) {
    const accents = slide.querySelectorAll('.underline-accent');
    accents.forEach((el, i) => {
      paintAccent(el, { delay: baseDelay + i * stagger });
    });
  }

  function pop(el, opts = {}) {
    if (!el) return;
    return el.animate(
      [
        { opacity: 0, transform: 'scale(0.6)' },
        { opacity: 1, transform: 'scale(1)' }
      ],
      {
        duration: opts.duration ?? 540,
        delay: opts.delay ?? 0,
        easing: opts.easing ?? EASE_SPRING,
        fill: 'both'
      }
    );
  }

  function monitorOn(el, opts = {}) {
    if (!el) return;
    return el.animate(
      [
        { opacity: 0, filter: 'brightness(0.2)' },
        { opacity: 0.6, filter: 'brightness(1.5)', offset: 0.18 },
        { opacity: 0.4, filter: 'brightness(0.8)', offset: 0.32 },
        { opacity: 1, filter: 'brightness(1)' }
      ],
      {
        duration: opts.duration ?? 720,
        delay: opts.delay ?? 0,
        easing: opts.easing ?? EASE_OUT_CUBIC,
        fill: 'both'
      }
    );
  }

  function countUp(el, opts = {}) {
    if (!el) return;
    const to = Number(el.dataset.countTo ?? 0);
    const from = Number(el.dataset.countFrom ?? 0);
    const duration = opts.duration ?? 900;
    if (reducedMotion) {
      el.textContent = to.toLocaleString();
      return;
    }
    const start = performance.now() + (opts.delay ?? 0);
    function tick(now) {
      const t = Math.max(0, Math.min(1, (now - start) / duration));
      const eased = 1 - Math.pow(1 - t, 3);
      const val = Math.round(from + (to - from) * eased);
      el.textContent = val.toLocaleString();
      if (t < 1) requestAnimationFrame(tick);
    }
    el.textContent = from.toLocaleString();
    requestAnimationFrame(tick);
  }

  function drawPath(path, opts = {}) {
    if (!path) return;
    let len = path.__cachedLen;
    if (!len) {
      try { len = path.getTotalLength(); } catch (e) { len = 4000; }
      path.__cachedLen = len;
    }
    path.style.setProperty('--path-len', len);
    path.style.strokeDasharray = `${len} ${len}`;
    return path.animate(
      [
        { strokeDashoffset: len },
        { strokeDashoffset: 0 }
      ],
      {
        duration: opts.duration ?? 1100,
        delay: opts.delay ?? 0,
        easing: opts.easing ?? EASE_OUT_CUBIC,
        fill: 'both'
      }
    );
  }

  function fadeIn(el, opts = {}) {
    if (!el) return;
    return el.animate(
      [{ opacity: 0 }, { opacity: opts.to ?? 1 }],
      {
        duration: opts.duration ?? 520,
        delay: opts.delay ?? 0,
        easing: opts.easing ?? EASE_OUT_CUBIC,
        fill: 'both'
      }
    );
  }

  // Wrap each word of a text node in <span> so we can stagger by word.
  function splitWords(el) {
    if (!el || el.dataset.split === 'done') return [];
    const text = el.textContent;
    el.textContent = '';
    const spans = [];
    const words = text.split(/(\s+)/);
    words.forEach(w => {
      if (/^\s+$/.test(w)) {
        el.appendChild(document.createTextNode(w));
      } else if (w.length > 0) {
        const s = document.createElement('span');
        s.className = 'anim-word';
        s.style.display = 'inline-block';
        s.textContent = w;
        el.appendChild(s);
        spans.push(s);
      }
    });
    el.dataset.split = 'done';
    return spans;
  }

  function typeIn(el, opts = {}) {
    if (!el) return;
    return el.animate(
      [
        { clipPath: 'inset(0 100% 0 0)' },
        { clipPath: 'inset(0 0 0 0)' }
      ],
      {
        duration: opts.duration ?? 600,
        delay: opts.delay ?? 0,
        easing: 'steps(24, end)',
        fill: 'both'
      }
    );
  }

  // ---- Per-slide animation table --------------------------------------
  //
  // Keyed by data-label substring (case-insensitive).
  //
  const animators = [
    {
      match: /01 Cover/i,
      run(slide) {
        const stripe = slide.querySelector('.stripe');
        const lines = slide.querySelectorAll('.cover-line');
        const meta = slide.querySelector('.meta');
        const eyebrow = slide.querySelector('.eyebrow');
        if (stripe) stripe.animate(
          [{ transform: 'translateX(-200px)', opacity: 0 },
           { transform: 'translateX(0)', opacity: 1 }],
          { duration: 480, easing: EASE_OUT_EXPO, fill: 'both' }
        );
        rise(eyebrow, { delay: 180, duration: 480 });
        lines.forEach((ln, i) => rise(ln, { delay: 280 + i * 180, duration: 560 }));
        paintAllAccents(slide, 280 + lines.length * 180 + 200);
        rise(meta, { delay: 280 + lines.length * 180 + 400, dy: 12, duration: 520 });
      }
    },
    {
      match: /02 Agenda/i,
      run(slide) {
        const eyebrow = slide.querySelector('.eyebrow');
        const title = slide.querySelector('.deck-h2');
        const items = slide.querySelectorAll('.pts li');
        rise(eyebrow, { duration: 420 });
        rise(title, { delay: 160, duration: 560 });
        items.forEach((li, i) => {
          const n = li.querySelector('.n');
          const t = li.querySelector('.t');
          rise(n, { delay: 380 + i * 240, dy: 8, duration: 360 });
          rise(t, { delay: 460 + i * 240, duration: 520 });
        });
      }
    },
    {
      match: /Section I$|Section II$|Section III$|Section divider|Emerging patterns/i,
      run(slide) {
        const num = slide.querySelector('.num');
        const h2 = slide.querySelector('h2');
        const sub = slide.querySelector('.sub');
        if (num) num.classList.add('anim-caret');
        if (num) typeIn(num, { duration: 520 });
        setTimeout(() => num && num.classList.add('anim-caret-done'), 1100);
        rise(h2, { delay: 360, duration: 620, easing: EASE_SPRING });
        rise(sub, { delay: 700, duration: 520 });
      }
    },
    {
      match: /04 Same idea two interfaces/i,
      run(slide) {
        const eyebrow = slide.querySelector('.eyebrow');
        const h2 = slide.querySelector('.deck-h2');
        const lead = slide.querySelector('.lead');
        const cards = slide.querySelectorAll('.card');
        rise(eyebrow, { duration: 420 });
        rise(h2, { delay: 160, duration: 580 });
        rise(lead, { delay: 360, duration: 520 });
        if (cards[0]) cascade([cards[0]], { x: -32, baseDelay: 580, duration: 600 });
        if (cards[1]) cascade([cards[1]], { x: 32, baseDelay: 760, duration: 600 });
      }
    },
    {
      match: /Bartleby RIP/i,
      run(slide) {
        const eyebrow = slide.querySelector('.deck-eyebrow');
        const headline = slide.querySelector('.bartleby-line');
        const quote = slide.querySelector('.bartleby-quote');
        const tomb = slide.querySelector('.bartleby-tomb');
        rise(eyebrow, { duration: 620, dy: 8 });
        rise(headline, { delay: 360, duration: 780 });
        rise(quote, { delay: 1200, duration: 700 });
        rise(tomb, { delay: 1900, duration: 600, dy: 6 });
      }
    },
    {
      match: /Bartleby login killed it/i,
      run(slide) {
        const eyebrow = slide.querySelector('.login-eyebrow');
        const card = slide.querySelector('.fake-authkit-card');
        const killTag = slide.querySelector('.kill-tag');
        const caption = slide.querySelector('.login-caption');
        rise(eyebrow, { duration: 480, dy: 6 });
        if (card) card.animate(
          [{ opacity: 0, transform: 'translateY(40px) scale(0.94)' },
           { opacity: 1, transform: 'translateY(0) scale(1)' }],
          { duration: 720, delay: 320, easing: EASE_OUT_EXPO, fill: 'both' }
        );
        if (killTag) killTag.animate(
          [{ opacity: 0, transform: 'rotate(-20deg) scale(0.3)' },
           { opacity: 1, transform: 'rotate(8deg) scale(1)' }],
          { duration: 600, delay: 1300, easing: EASE_SPRING, fill: 'both' }
        );
        rise(caption, { delay: 1900, duration: 620 });
      }
    },
    {
      match: /Behind the interface/i,
      run(slide) {
        const eyebrow = slide.querySelector('.eyebrow');
        const h2 = slide.querySelector('.deck-h2');
        const lead = slide.querySelector('.lead.muted');
        const cols = slide.querySelectorAll('.capability-col');
        const strip = slide.querySelector('.unifying-strip');
        const punch = slide.querySelector('.hood-punch');
        rise(eyebrow, { duration: 420 });
        rise(h2, { delay: 160, duration: 580 });
        paintAllAccents(slide, 700);
        rise(lead, { delay: 380, duration: 520 });
        // Cascade the 4 capability columns left to right
        cascade(cols, { dy: 24, baseDelay: 620, stagger: 220, duration: 540 });
        // Then the unifying strip and the punch line
        const colsEnd = 620 + cols.length * 220 + 200;
        rise(strip, { delay: colsEnd, duration: 540 });
        rise(punch, { delay: colsEnd + 320, duration: 620, easing: EASE_SPRING });
      }
    },
    {
      match: /4d The asymmetry|The asymmetry/i,
      run(slide) {
        const eyebrow = slide.querySelector('.eyebrow');
        const h2 = slide.querySelector('.deck-h2');
        const input = slide.querySelector('.asymmetry-input');
        const arrow = slide.querySelector('.arrow-col');
        const chips = slide.querySelectorAll('.asymmetry-output .chip');
        const outLabel = slide.querySelector('.asymmetry-output .label');
        const punch = slide.querySelector('.hood-punch');
        rise(eyebrow, { duration: 420 });
        rise(h2, { delay: 160, duration: 580 });
        paintAllAccents(slide, 700);
        // Input box appears first, calmly
        rise(input, { delay: 420, duration: 620 });
        // Big arrow points the way
        if (arrow) arrow.animate(
          [{ opacity: 0, transform: 'translateX(-30px)' },
           { opacity: 1, transform: 'translateX(0)' }],
          { duration: 480, delay: 1000, easing: EASE_OUT_EXPO, fill: 'both' }
        );
        // Output label
        rise(outLabel, { delay: 1200, duration: 420 });
        // Then the SWARM of chips — fast cascade to emphasize the volume
        cascade(chips, { dy: 14, baseDelay: 1400, stagger: 80, duration: 380 });
        // Punch line lands last with spring
        const chipsEnd = 1400 + chips.length * 80 + 200;
        rise(punch, { delay: chipsEnd, duration: 720, easing: EASE_SPRING });
      }
    },
    {
      match: /Blog Bot in the wild/i,
      run(slide) {
        const eyebrow = slide.querySelector('.eyebrow');
        const h2 = slide.querySelector('.deck-h2');
        const msgs = slide.querySelectorAll('.slack-msg');
        rise(eyebrow, { duration: 420 });
        rise(h2, { delay: 160, duration: 580 });
        paintAllAccents(slide, 700);
        // Cascade the slack messages in like they're arriving
        cascade(msgs, { dy: 18, baseDelay: 600, stagger: 380, duration: 540 });
      }
    },
    {
      match: /Behind the interface/i,
      run(slide) {
        const eyebrow = slide.querySelector('.eyebrow');
        const h2 = slide.querySelector('.deck-h2');
        const lead = slide.querySelector('.lead.muted');
        const steps = slide.querySelectorAll('.pipeline-12 .step');
        const tags = slide.querySelectorAll('.hood-tags .tag');
        const punch = slide.querySelector('.hood-punch');
        rise(eyebrow, { duration: 420 });
        rise(h2, { delay: 160, duration: 580 });
        paintAllAccents(slide, 700);
        rise(lead, { delay: 460, duration: 520 });
        // Cascade the 12 steps fast, like they're being checked off
        cascade(steps, { dy: 10, baseDelay: 700, stagger: 110, duration: 380 });
        // Tags appear together after the checklist completes
        const stepsEnd = 700 + steps.length * 110 + 200;
        cascade(tags, { dy: 8, baseDelay: stepsEnd, stagger: 100, duration: 380 });
        // Punch line lands last with the spring
        rise(punch, { delay: stepsEnd + tags.length * 100 + 300, duration: 620, easing: EASE_SPRING });
      }
    },
    {
      match: /05 1000 hours/i,
      run(slide) {
        const eyebrow = slide.querySelector('.eyebrow');
        const numEl = slide.querySelector('[data-count-to]');
        const hoursLine = slide.querySelector('.mega > div:nth-child(2)');
        const unit = slide.querySelector('.mega .unit');
        const body = slide.querySelector('.lead');
        rise(eyebrow, { duration: 420 });
        // Mega number rises in, then counts up
        const mega = slide.querySelector('.mega');
        rise(mega, { delay: 200, duration: 480 });
        countUp(numEl, { delay: 320, duration: 1000 });
        rise(hoursLine, { delay: 900, duration: 520 });
        rise(unit, { delay: 1200, duration: 520 });
        rise(body, { delay: 1500, duration: 600 });
      }
    },
    {
      match: /06 The lesson|meet users/i,
      run(slide) {
        const eyebrow = slide.querySelector('.eyebrow');
        const h2 = slide.querySelector('.deck-h2');
        const body = slide.querySelector('.lead');
        rise(eyebrow, { duration: 420 });
        rise(h2, { delay: 200, duration: 600, easing: EASE_SPRING });
        paintAllAccents(slide, 720);
        rise(body, { delay: 900, duration: 560 });
      }
    },
    {
      match: /08 Boris quote/i,
      run(slide) {
        const marks = slide.querySelectorAll('.quote .mark');
        const quote = slide.querySelector('.quote');
        const attrib = slide.querySelector('.attrib');
        // Pop the opening quote mark
        if (marks[0]) pop(marks[0], { delay: 0, duration: 560 });
        // Word-stagger the quote text (excluding the marks)
        // Animate the whole quote line by line via children
        const words = quote ? Array.from(quote.childNodes).filter(n => n.nodeType === 1 && !n.classList.contains('mark')) : [];
        // Simpler: rise the whole quote, paint the underline
        rise(quote, { delay: 220, duration: 720, easing: EASE_OUT_EXPO });
        paintAllAccents(slide, 900);
        rise(attrib, { delay: 1200, duration: 520 });
      }
    },
    {
      match: /09 Anatomy of a loop/i,
      run(slide) {
        const eyebrow = slide.querySelector('.eyebrow');
        const h2 = slide.querySelector('.deck-h2');
        const lead = slide.querySelector('.lead');
        const nodes = slide.querySelectorAll('.pipe-node');
        const arrows = slide.querySelectorAll('.pipe-arrow path');
        rise(eyebrow, { duration: 420 });
        rise(h2, { delay: 160, duration: 560 });
        rise(lead, { delay: 340, duration: 520 });
        // Cascade nodes left to right
        cascade(nodes, { x: -24, baseDelay: 600, stagger: 240, duration: 520 });
        // Draw each arrow right after its node lands
        arrows.forEach((path, i) => {
          drawPath(path, { delay: 760 + i * 240, duration: 360 });
        });
      }
    },
    {
      match: /Speed requires safety/i,
      run(slide) {
        const eyebrow = slide.querySelector('.eyebrow');
        const h2 = slide.querySelector('.deck-h2');
        const lead = slide.querySelector('.lead.muted');
        const nodes = slide.querySelectorAll('.pipe-node');
        const arrows = slide.querySelectorAll('.pipe-arrow path');
        const tags = slide.querySelectorAll('.hood-tags .tag');
        const punch = slide.querySelector('.hood-punch');
        rise(eyebrow, { duration: 420 });
        rise(h2, { delay: 160, duration: 580 });
        paintAllAccents(slide, 600);
        rise(lead, { delay: 360, duration: 520 });
        cascade(nodes, { x: -24, baseDelay: 600, stagger: 220, duration: 520 });
        arrows.forEach((path, i) => drawPath(path, { delay: 740 + i * 220, duration: 340 }));
        const tagsStart = 600 + nodes.length * 220 + 200;
        cascade(tags, { dy: 8, baseDelay: tagsStart, stagger: 110, duration: 380 });
        rise(punch, { delay: tagsStart + tags.length * 110 + 300, duration: 620, easing: EASE_SPRING });
      }
    },
    {
      match: /10 Three minutes|10 Kit/i,
      run(slide) {
        const eyebrow = slide.querySelector('.eyebrow');
        const h2 = slide.querySelector('.deck-h2');
        const numEl = slide.querySelector('[data-count-to]');
        const mega = slide.querySelector('.mega');
        const subline = slide.querySelector('.kit-subline');
        const kitItems = slide.querySelectorAll('.kit-strip .item');
        rise(eyebrow, { duration: 420 });
        rise(h2, { delay: 160, duration: 560 });
        rise(mega, { delay: 360, duration: 480 });
        countUp(numEl, { delay: 480, duration: 700 });
        rise(subline, { delay: 1100, duration: 520 });
        cascade(kitItems, { dy: 18, baseDelay: 1300, stagger: 200, duration: 520 });
      }
    },
    {
      match: /Loop in action/i,
      run(slide) {
        const eyebrow = slide.querySelector('.eyebrow');
        const h2 = slide.querySelector('.deck-h2');
        const lead = slide.querySelector('.lead.muted');
        const steps = slide.querySelectorAll('.loop-step');
        const punch = slide.querySelector('.hood-punch');
        rise(eyebrow, { duration: 420 });
        rise(h2, { delay: 160, duration: 560 });
        paintAllAccents(slide, 660);
        rise(lead, { delay: 360, duration: 480 });
        // Steps cascade top-to-bottom like the bot working through them.
        // Each row's dot + text rise together. ~140ms stagger feels brisk
        // but readable — eight steps in ~1.2s total.
        cascade(steps, { dy: 14, baseDelay: 620, stagger: 140, duration: 420 });
        const stepsEnd = 620 + steps.length * 140 + 200;
        rise(punch, { delay: stepsEnd, duration: 620, easing: EASE_SPRING });
      }
    },
    {
      match: /Directly not via MCP|10 Directly/i,
      run(slide) {
        const eyebrow = slide.querySelector('.eyebrow');
        const h2 = slide.querySelector('.deck-h2');
        const bodyCol = slide.querySelectorAll('.cols > div')[0];
        const code = slide.querySelector('.codeblock');
        rise(eyebrow, { duration: 420 });
        rise(h2, { delay: 160, duration: 580 });
        paintAllAccents(slide, 600);
        rise(bodyCol, { delay: 600, duration: 560 });
        monitorOn(code, { delay: 900, duration: 720 });
      }
    },
    {
      match: /12 Gap chart|Gap chart/i,
      run(slide) {
        const eyebrow = slide.querySelector('.eyebrow');
        const h2 = slide.querySelector('.deck-h2');
        rise(eyebrow, { duration: 420 });
        rise(h2, { delay: 160, duration: 580 });
        const paths = slide.querySelectorAll('.draw-path');
        const fades = slide.querySelectorAll('.draw-fade');
        const labels = slide.querySelectorAll('.gap-chart text, .gap-chart .gap-legend');
        // Draw capability curve (orange)
        if (paths[0]) drawPath(paths[0], { delay: 460, duration: 1200 });
        // Draw usage curve (dashed) starting after capability has begun
        if (paths[1]) drawPath(paths[1], { delay: 900, duration: 900 });
        // Gap shading + labels + arrow fade in last
        fades.forEach((f, i) => fadeIn(f, { delay: 1800 + i * 180, to: 1, duration: 520 }));
      }
    },
    {
      match: /13 Re-ask/i,
      run(slide) {
        const eyebrow = slide.querySelector('.eyebrow');
        const h2 = slide.querySelector('.deck-h2');
        const lead = slide.querySelector('.lead');
        const body = slide.querySelectorAll('.lead.muted, .muted')[0];
        rise(eyebrow, { duration: 420 });
        rise(h2, { delay: 160, duration: 580 });
        rise(lead, { delay: 460, duration: 720, easing: EASE_OUT_EXPO });
        paintAllAccents(slide, 900, 110);
        if (body && body !== lead) rise(body, { delay: 1500, duration: 520 });
      }
    },
    {
      match: /15 This months answer|This month's answer/i,
      run(slide) {
        const eyebrow = slide.querySelector('.eyebrow');
        const h2 = slide.querySelector('.deck-h2');
        const steps = slide.querySelectorAll('.worked-example .step');
        const punch = slide.querySelector('.worked-punch');
        rise(eyebrow, { duration: 420 });
        rise(h2, { delay: 160, duration: 580 });
        cascade(steps, { dy: 16, baseDelay: 460, stagger: 380, duration: 560 });
        rise(punch, { delay: 460 + steps.length * 380 + 200, duration: 620, easing: EASE_SPRING });
      }
    },
    {
      match: /Buffer pattern/i,
      run(slide) {
        const eyebrow = slide.querySelector('.eyebrow');
        const h2 = slide.querySelector('.deck-h2');
        const lead = slide.querySelector('.lead');
        const cards = slide.querySelectorAll('.card');
        rise(eyebrow, { duration: 420 });
        rise(h2, { delay: 160, duration: 580 });
        rise(lead, { delay: 340, duration: 520 });
        cascade(cards, { dy: 24, baseDelay: 600, stagger: 250, duration: 540 });
      }
    },
    {
      match: /Recap/i,
      run(slide) {
        const eyebrow = slide.querySelector('.eyebrow');
        const h2 = slide.querySelector('.deck-h2');
        const rows = slide.querySelectorAll('.ladder .row');
        const tease = slide.querySelector('.recap-tease');
        rise(eyebrow, { duration: 420 });
        rise(h2, { delay: 160, duration: 580 });
        cascade(rows, { dy: 18, baseDelay: 460, stagger: 280, duration: 520 });
        // Paint each underline 140ms after its row lands
        const accents = slide.querySelectorAll('.ladder .underline-accent');
        accents.forEach((el, i) => paintAccent(el, { delay: 600 + i * 280, duration: 520 }));
        rise(tease, { delay: 460 + rows.length * 280 + 240, duration: 620 });
      }
    },
    {
      match: /Thanks/i,
      run(slide) {
        const stripe = slide.querySelector('.stripe');
        const eyebrow = slide.querySelector('.eyebrow');
        const h2 = slide.querySelector('.deck-h2');
        const body = slide.querySelector('.lead');
        const meta = slide.querySelector('.meta');
        if (stripe) stripe.animate(
          [{ transform: 'translateX(-200px)', opacity: 0 },
           { transform: 'translateX(0)', opacity: 1 }],
          { duration: 480, easing: EASE_OUT_EXPO, fill: 'both' }
        );
        rise(eyebrow, { delay: 180, duration: 420 });
        rise(h2, { delay: 300, duration: 720, easing: EASE_SPRING });
        rise(body, { delay: 760, duration: 560 });
        rise(meta, { delay: 1000, duration: 520 });
      }
    }
  ];

  // Fallback: gentle rise on common elements.
  function defaultRun(slide) {
    const eyebrow = slide.querySelector('.eyebrow');
    const h2 = slide.querySelector('h2');
    const lead = slide.querySelector('.lead, .body');
    rise(eyebrow, { duration: 420 });
    rise(h2, { delay: 160, duration: 560 });
    rise(lead, { delay: 360, duration: 520 });
    paintAllAccents(slide, 700);
  }

  function runForSlide(slide) {
    if (!slide) return;
    clearAnims(slide);
    const label = slide.getAttribute('data-label') || '';
    const hit = animators.find(a => a.match.test(label));
    try {
      if (hit) hit.run(slide);
      else defaultRun(slide);
    } catch (e) {
      console.warn('[deck-animations] handler error for', label, e);
      defaultRun(slide);
    }
  }

  // ---- Wire to <deck-stage> -------------------------------------------

  function attach() {
    const stage = document.querySelector('deck-stage');
    if (!stage) {
      // deck-stage hasn't upgraded yet; try again next frame.
      requestAnimationFrame(attach);
      return;
    }
    stage.addEventListener('slidechange', (e) => {
      const slide = e.detail && e.detail.slide;
      // Run synchronously — rAF is paused when the tab is backgrounded,
      // which would prevent animations from registering during off-screen
      // previews. The active slide is already laid out by this point.
      runForSlide(slide);
    });
    // The deck-stage may have already dispatched its initial 'slidechange'
    // (reason: 'init') before this listener attached. Catch up by animating
    // whatever slide is currently active.
    const active = stage.querySelector('section[data-deck-active]');
    if (active) runForSlide(active);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
})();
