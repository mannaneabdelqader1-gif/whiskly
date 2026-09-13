# Whiskly deploy (Cloudflare Workers / Pages)

**Live URL:** https://whiskly.whatcanieat.workers.dev  
**GA4 ID:** G-E2XBN094SK

## Workers (your current setup)

1. Put all site files in the repo root (or the folder you deploy).
2. Include `wrangler.jsonc` with SPA fallback:

```jsonc
{
  "name": "whiskly",
  "compatibility_date": "2026-09-11",
  "assets": {
    "directory": ".",
    "not_found_handling": "single-page-application"
  }
}
```

3. Deploy:

```bash
npx wrangler deploy
```

`not_found_handling: "single-page-application"` makes `/recipes`, `/meal-plan`, `/grocery`, and `/recipes/slug-id` serve `index.html` (no 404).

## Pages (alternative)

Use `_redirects` (Workers ignore it). Build output = folder with `index.html`.

## Files to upload

- index.html
- style.css
- script.js
- favicon.svg
- og-image.svg
- robots.txt
- sitemap.xml
- wrangler.jsonc  ← required for Workers SPA routes
- _redirects      ← only needed for Pages

## After deploy, check

- https://whiskly.whatcanieat.workers.dev/
- https://whiskly.whatcanieat.workers.dev/recipes  → 200, not 404
- https://whiskly.whatcanieat.workers.dev/meal-plan
- https://whiskly.whatcanieat.workers.dev/script.js
