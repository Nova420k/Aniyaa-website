# Aniyaa website

Product site for **[Aniyaa](https://github.com/Gourab0002/Aniyaa)** — an unofficial Android client for [nyaa.si](https://nyaa.si).

Live (GitHub Pages): [gourab0002.github.io/Aniyaa-website](https://gourab0002.github.io/Aniyaa-website/)

## What this repo is

Static HTML, CSS, and a little JavaScript. The layout is inspired by the Morphe marketing site (hero, features, how-it-works, FAQ, changelog), but the code, palette, and copy are original to Aniyaa.

- Home, download, FAQ, changelog, privacy
- Light / dark theme (saved in `localStorage`)
- Latest APK URL from the GitHub Releases API
- Changelog rendered from GitHub release notes

The app itself is AGPL-3.0. This website is MIT.

## Local preview

```bash
python -m http.server 4173
```

Then open `http://127.0.0.1:4173`.

## Deploy

Push to `main`. GitHub Actions publishes Pages from the repo root. You also need Pages enabled on the repository: **Settings → Pages → Source = GitHub Actions**.
