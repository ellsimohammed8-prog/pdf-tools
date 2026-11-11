// Quick screenshots for a visual check of the built site.
import http from 'node:http';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const CHROME = join(process.env.HOME, '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.bcmap': 'application/octet-stream', '.pfb': 'application/octet-stream' };

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = join(DIST, urlPath);
  if (urlPath.endsWith('/')) file = join(file, 'index.html');
  if (!existsSync(file) || !file.startsWith(DIST)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
mkdirSync('/tmp/pdf-tools-shots', { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(base + '/', { waitUntil: 'networkidle' });
await page.screenshot({ path: '/tmp/pdf-tools-shots/home-desktop.png', fullPage: true });
await page.goto(base + '/merge-pdf/', { waitUntil: 'networkidle' });
await page.screenshot({ path: '/tmp/pdf-tools-shots/merge-desktop.png', fullPage: true });
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto(base + '/', { waitUntil: 'networkidle' });
await mobile.screenshot({ path: '/tmp/pdf-tools-shots/home-mobile.png', fullPage: true });
await browser.close();
server.close();
console.log('screenshots saved');
