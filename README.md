# PDF Tools

Free PDF tools that run entirely in your browser — merge, split, compress,
convert and rotate PDFs. No uploads, no accounts, no limits.

## Tools

- **Merge PDF** — combine several PDFs into one, in any order
- **Split PDF** — extract pages, split every N pages, or one PDF per page
- **Compress PDF** — shrink PDFs (pages become images; best for scans)
- **JPG to PDF** — turn JPG/PNG images into a single PDF
- **Rotate PDF** — rotate, delete and reorder pages with live previews

## Privacy

There is no server. Every tool runs as JavaScript inside the visitor's
browser, on their own device. Files are never uploaded, stored or tracked.

## Stack

Vanilla JavaScript (ES modules) + Vite (build only) + pdf-lib + PDF.js.
Static output — deploy anywhere that serves static files.

## Develop

```bash
npm install
npm run dev
```

## Build

```bash
npm run build   # output in dist/
```

Deploy `dist/` to Cloudflare Pages (drag-and-drop) or connect this repo
to Cloudflare Pages — it builds with `npm run build`, output `dist/`.

## Tests

```bash
npm test                    # Node smoke tests (merge, split, rotate, JPG to PDF)
node test/smoke-browser.mjs # full browser end-to-end tests (needs Playwright + Chromium)
```

## Licence

MIT. Built with [pdf-lib](https://pdf-lib.js.org/) and
[PDF.js](https://mozilla.github.io/pdf.js/) (both MIT).
