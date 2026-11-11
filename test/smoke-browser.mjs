// Full browser end-to-end smoke test.
// Serves dist/ over HTTP, drives every tool in real Chromium (Playwright),
// downloads the results and verifies them with pdf-lib.
// Run: node test/smoke-browser.mjs
import http from 'node:http';
import { createReadStream, existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { chromium } from 'playwright-core';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import JSZip from 'jszip';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const TMP = '/tmp/pdf-tools-smoke';
mkdirSync(TMP, { recursive: true });

const CHROME = join(process.env.HOME, '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome');

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name} ${detail}`);
  }
}

// ---------- static server ----------
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
  '.pfm': 'application/octet-stream',
  '.afm': 'application/octet-stream',
  '.icc': 'application/octet-stream',
};

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let file = join(DIST, urlPath);
      if (urlPath.endsWith('/')) file = join(file, 'index.html');
      if (!existsSync(file) || !file.startsWith(DIST)) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// ---------- sample files ----------
async function makePdf(path, pageSizes) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  pageSizes.forEach(([w, h], i) => {
    const page = doc.addPage([w, h]);
    page.drawText(`Sample page ${i + 1}`, { x: 20, y: h - 40, size: 18, font, color: rgb(0, 0, 0) });
    page.drawText('The quick brown fox jumps over the lazy dog. '.repeat(8), {
      x: 20, y: h - 80, size: 11, font, color: rgb(0.2, 0.2, 0.2), maxWidth: w - 40, lineHeight: 14,
    });
  });
  writeFileSync(path, await doc.save());
}

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}
function makeNoisePng(width, height) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  // xorshift32 — a real PRNG, so the pixels are incompressible (like a photo).
  // (A plain LCG's low byte repeats every 256 values and compresses to nothing.)
  let seed = 0x12345678;
  const rnd = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) % 256;
  };
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const o = y * (width * 3 + 1) + 1 + x * 3;
      raw[o] = rnd();
      raw[o + 1] = rnd();
      raw[o + 2] = rnd();
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
function makeSolidPng(width, height, [r, g, b]) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const o = y * (width * 3 + 1) + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function pageCount(bytes) {
  return (await PDFDocument.load(bytes)).getPageCount();
}

// ---------- main ----------
const server = await serve();
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;
console.log(`serving dist/ at ${base}`);

const aPdf = join(TMP, 'a.pdf');
const bPdf = join(TMP, 'b.pdf');
const scanPng = join(TMP, 'scan.png');
const scanPdf = join(TMP, 'scan.pdf');
const photoPng = join(TMP, 'photo.png');
const photoJpg = join(TMP, 'photo.jpg');

await makePdf(aPdf, [[595, 842], [595, 842], [595, 842]]);
await makePdf(bPdf, [[595, 842], [595, 842]]);
writeFileSync(scanPng, makeNoisePng(1200, 900));
writeFileSync(photoPng, makeSolidPng(800, 600, [30, 120, 90]));
{
  // A PDF with one big embedded photo (a "scan") — compress must shrink it.
  const doc = await PDFDocument.create();
  const img = await doc.embedPng(readFileSync(scanPng));
  const page = doc.addPage([595, 842]);
  page.drawImage(img, { x: 0, y: 200, width: 595, height: 446 });
  writeFileSync(scanPdf, await doc.save());
}

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

async function downloadAfter(clickFn) {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 120_000 }),
    clickFn(),
  ]);
  const path = join(TMP, download.suggestedFilename());
  await download.saveAs(path);
  return path;
}

try {
  console.log('homepage');
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  check('homepage title', (await page.title()).includes('Free PDF Tools'));
  check('homepage has 5 tool cards', (await page.locator('.tool-card').count()) === 5);
  check('homepage privacy message', (await page.locator('text=never leave your browser').count()) >= 1);
  check('homepage: no lazy PDF libs loaded', (await page.evaluate(() => performance.getEntriesByType('resource').some((r) => r.name.includes('pdf.worker') || r.name.includes('pdf-lib')))) === false);

  console.log('merge');
  await page.goto(base + '/merge-pdf/', { waitUntil: 'networkidle' });
  await page.setInputFiles('#file-input', [aPdf, bPdf]);
  await page.waitForSelector('.file-item', { timeout: 15_000 });
  check('merge: 2 files listed', (await page.locator('.file-item').count()) === 2);
  const mergedPath = await downloadAfter(() => page.click('#merge-btn'));
  await page.waitForSelector('#result.visible', { timeout: 30_000 });
  check('merge: download produced', existsSync(mergedPath));
  check('merge: 3 + 2 = 5 pages', (await pageCount(readFileSync(mergedPath))) === 5);

  console.log('split (ranges)');
  await page.goto(base + '/split-pdf/', { waitUntil: 'networkidle' });
  await page.setInputFiles('#file-input', [aPdf]);
  await page.waitForSelector('#split-btn:not([disabled])', { timeout: 15_000 });
  await page.fill('#ranges-input', '1-2');
  const splitPath = await downloadAfter(() => page.click('#split-btn'));
  await page.waitForSelector('#result.visible', { timeout: 30_000 });
  check('split ranges: download produced', existsSync(splitPath));
  check('split ranges: 2 pages out', (await pageCount(readFileSync(splitPath))) === 2);

  console.log('split (each page -> ZIP)');
  await page.click('label[for="mode-each"]');
  const zipPath = await downloadAfter(() => page.click('#split-btn'));
  await page.waitForSelector('#result.visible', { timeout: 30_000 });
  check('split each: ZIP downloaded', zipPath.endsWith('.zip') && existsSync(zipPath));
  const zip = await JSZip.loadAsync(readFileSync(zipPath));
  check('split each: ZIP has 3 PDFs', Object.keys(zip.files).filter((n) => n.endsWith('.pdf')).length === 3);

  console.log('compress');
  await page.goto(base + '/compress-pdf/', { waitUntil: 'networkidle' });
  await page.setInputFiles('#file-input', [scanPdf]);
  await page.waitForSelector('#compress-btn:not([disabled])', { timeout: 15_000 });
  const before = readFileSync(scanPdf).length;
  const compressedPath = await downloadAfter(() => page.click('#compress-btn'));
  await page.waitForSelector('#result.visible', { timeout: 60_000 });
  const after = readFileSync(compressedPath).length;
  check('compress: download produced', existsSync(compressedPath));
  check(`compress: shrank ${before} -> ${after} bytes`, after < before, `(${before} -> ${after})`);
  check('compress: still 1 page', (await pageCount(readFileSync(compressedPath))) === 1);
  check('compress: result shows saved %', (await page.locator('#result').innerText()).includes('saved'));

  console.log('jpg to pdf');
  // Make a real JPEG in the browser (canvas -> JPEG data URL -> file).
  const jpgDataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 480;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 640, 480);
    g.addColorStop(0, '#0e7490');
    g.addColorStop(1, '#f59e0b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 640, 480);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText('Test photo', 180, 250);
    return c.toDataURL('image/jpeg', 0.9);
  });
  writeFileSync(photoJpg, Buffer.from(jpgDataUrl.split(',')[1], 'base64'));
  await page.goto(base + '/jpg-to-pdf/', { waitUntil: 'networkidle' });
  await page.setInputFiles('#file-input', [photoPng, photoJpg]);
  await page.waitForSelector('.file-item', { timeout: 15_000 });
  check('jpg-to-pdf: 2 images listed', (await page.locator('.file-item').count()) === 2);
  const jpgPdfPath = await downloadAfter(() => page.click('#convert-btn'));
  await page.waitForSelector('#result.visible', { timeout: 30_000 });
  check('jpg-to-pdf: download produced', existsSync(jpgPdfPath));
  check('jpg-to-pdf: PNG + JPG -> 2 pages', (await pageCount(readFileSync(jpgPdfPath))) === 2);

  console.log('rotate / organise');
  await page.goto(base + '/rotate-pdf/', { waitUntil: 'networkidle' });
  await page.setInputFiles('#file-input', [aPdf]);
  await page.waitForSelector('.page-card', { timeout: 30_000 });
  check('rotate: 3 page previews', (await page.locator('.page-card').count()) === 3);
  // Rotate first page right, remove second page.
  await page.locator('.page-card').first().locator('button[title="Rotate right (90°)"]').click();
  await page.locator('.page-card').nth(1).locator('button[title="Remove page"]').click();
  const rotatedPath = await downloadAfter(() => page.click('#save-btn'));
  await page.waitForSelector('#result.visible', { timeout: 30_000 });
  check('rotate: download produced', existsSync(rotatedPath));
  const rotatedDoc = await PDFDocument.load(readFileSync(rotatedPath));
  check('rotate: 2 pages kept (1 removed)', rotatedDoc.getPageCount() === 2);
  check('rotate: first page rotated 90 degrees', rotatedDoc.getPage(0).getRotation().angle === 90);

  console.log('console errors');
  check('no console/page errors during the whole run', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  server.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
