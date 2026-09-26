# Aniyaa website

Product site for **Aniyaa** — an unofficial Android client for [nyaa.si](https://nyaa.si).

**Live:** [https://aniyaa.pages.dev](https://aniyaa.pages.dev)

## What this repo is

Static HTML, CSS, and a little JavaScript. The layout is inspired by the Morphe marketing site (hero, features, how-it-works, FAQ, changelog), but the code, palette, and copy are original to Aniyaa.

- Home, download, FAQ, changelog, privacy
- Light / dark theme (saved in `localStorage`)
- Latest APK URL from the GitHub Releases API
- Changelog rendered from GitHub release notes

The app itself is AGPL-3.0. This website is MIT.

## Local preview

```bash
py -m http.server 4173
```

Then open `http://127.0.0.1:4173`.

## Responsive design

`css/styles.css` ends with a single **Mobile & tablet optimization** layer, because
several base rules are declared *after* the older breakpoints and would otherwise
win on source order. It is layered in this order:

| Tier | Query | Purpose |
| --- | --- | --- |
| Safe areas | `env(safe-area-inset-*)` | Notch, home indicator, landscape cutout |
| Touch ergonomics | `@media (hover: none)` | 44px targets, no sticky hover, tap feedback |
| Tablet | `max-width: 1024px` | Stacked hero, 2-up card grids, cheaper blur |
| Drawer | `max-width: 920px` | Nav collapses before the layout does |
| Phone | `max-width: 700px` | 1-up grids, compact device mockup, solid glass |
| Small phone | `max-width: 380px` | Tighter type and nav |
| Landscape phone | `orientation: landscape` + `max-height: 560px` | Two-column hero, short mockup |

All pages use `viewport-fit=cover`, which is what makes the `env()` insets resolve.

## Performance

`js/particles.js` picks a device profile once (`Save-Data`, `deviceMemory`,
`hardwareConcurrency`, pointer type) and scales itself to it: a capped backing-store
DPR, a ~30fps draw budget on touch, a smaller field, and no O(n²) repulsion pass.
`js/fx.js` only re-schedules its parallax loop while something is still settling, so
it idles at 0 rAF/s once the hero scrolls away. `js/site.js` funnels every
scroll-driven widget through one rAF-throttled listener.

## Checks

No test framework — these are plain Node scripts.

```bash
node scripts/verify.mjs    # encoding, meta, a11y hooks, CSS balance, sitemap, build inputs
node scripts/smoke.mjs     # 56 interaction assertions over the DevTools Protocol
node scripts/perf.mjs      # frame rate, DPR cap, off-screen idling
node scripts/devices.mjs   # layout across 7 device profiles; add --shots for PNGs
```

`devices.mjs` and friends drive a real headless Chrome with `Emulation.*` overrides,
because `--window-size` silently clamps to a 500px minimum and will happily report a
"390px phone" that is actually 500px wide. Useful flags: `--only=phone-390`,
`--pages=faq.html`, `--shots`, `--dark`, `--vp`, `--scroll=1200`.

## Deploy

The public site is Cloudflare Pages (`aniyaa.pages.dev`). A GitHub Action on `main` assembles `site/` with `node scripts/prepare-site.mjs` and deploys it.

Local one-off deploy (optional):

```bash
node scripts/prepare-site.mjs
npx wrangler pages deploy ./site --project-name=aniyaa --commit-dirty=true
```

