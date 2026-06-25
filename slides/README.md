# The AI-Native Engineer — slides

Animated HTML slide deck for the **"The AI-Native Engineer"** workshop
(AI Engineer / AIE, San Francisco). Tagline: *Stop typing. Start operating.*
Presenters: Zack Proser & Nick Nisi.

Hand-built animated HTML, served as a Cloudflare Worker with static assets. Same
reusable presenter engine as Zack's other decks (1920×1080 stage scaling,
keyboard/touch nav, hash deep-links, speaker notes).

## Layout

- `public/index.html` — the whole deck. One `<section data-label="...">` per slide.
- `public/colors_and_type.css` — design tokens (dark theme, teal-green leverage accent, amber secondary).
- `public/deck-animations.css` + `deck-animations.js` — entry animations, matched by `data-label`.
- `public/deck-stage.js` — the presenter engine: 1920×1080 stage scaling, keyboard/touch
  nav, hash deep-links, speaker notes (reads the `#speaker-notes` JSON array).
- `public/_headers` — `X-Robots-Tag: noindex`.
- `wrangler.jsonc` — Cloudflare deploy config (WorkOS Internal account).

## Editing slides

Each `==== N NAME ====` comment block is a slide. Speaker notes live in the
`#speaker-notes` JSON array at the bottom — one string per slide, same order, so
keep them in sync when you add/remove slides.

Slide labels matter: the `data-label` selects which entry animation runs. Reuse
the existing label conventions to get animations for free, e.g. labels containing
`Section divider` (big number + headline), `Buffer pattern` (card cascade),
`09 Anatomy of a loop` (left-to-right pipeline), `Loop in action` (step cascade),
`05 1000 hours` / `10 Three minutes` (mega count-up), `Recap` (ladder), `01 Cover`,
`Thanks` (close). See the `animators` table in `deck-animations.js`.

QR-code images are placeholders — drop real PNGs into `public/img/` and uncomment
the `<img>` tags (search the HTML for `QR placeholder`).

## Local preview

```bash
python3 -m http.server -d public 8080
# then open http://localhost:8080  (deep-link a slide with #6, #14, …)
```

Arrow keys / space advance; works on phones for the QR audience.

## Deploy

Deploys to the **WorkOS Internal** Cloudflare account (already logged in via
`wrangler login`). The `account_id` is pinned in `wrangler.jsonc`.

```bash
cd slides
npx wrangler deploy
```

> The deck is behind **Cloudflare Access** until a bypass app is added — a curl
> to the deployed URL may `302` to the Access login. That's expected; a human
> will add the bypass app. Do not create Access apps from here.
