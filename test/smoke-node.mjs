// Node smoke tests for the pure PDF functions (src/lib/pdf-tools.js).
// Compress is NOT tested here (it needs a browser canvas) — see
// test/smoke-browser.mjs for the full end-to-end run including compress.
import { deflateSync } from 'node:zlib';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import {
  mergePdfs,
  splitPdf,
  transformPages,
  pageRotations,
  imagesToPdf,
  countPages,
  parsePageRanges,
  loadPdf,
} from '../src/lib/pdf-tools.js';

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

async function expectThrow(name, fn, match) {
  try {
    await fn();
    check(name, false, '(no error thrown)');
  } catch (err) {
    check(name, !match || match.test(err.message), `(got: ${err.message})`);
  }
}

// ---------- helpers ----------
async function makePdf(pageSizes, labels) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  pageSizes.forEach(([w, h], i) => {
    const page = doc.addPage([w, h]);
    page.drawText(labels?.[i] ?? `Page ${i + 1}`, {
      x: 20,
      y: h - 40,
      size: 18,
      font,
      color: rgb(0, 0, 0),
    });
  });
  return doc.save();
}

async function pageSizes(bytes) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((p) => [p.getWidth(), p.getHeight()]);
}

// Minimal PNG encoder (RGB, no interlace) for the JPG→PDF test.
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

function makePng(width, height, [r, g, b]) {
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
  const idat = deflateSync(raw);
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk('IHDR', ihdr),
      pngChunk('IDAT', idat),
      pngChunk('IEND', Buffer.alloc(0)),
    ])
  );
}

// ---------- tests ----------
console.log('merge');
{
  const a = await makePdf([[200, 200], [300, 300]], ['A1', 'A2']);
  const b = await makePdf([[400, 400]], ['B1']);
  const merged = await mergePdfs([a, b]);
  check('merge: 2 PDFs -> 3 pages', (await countPages(merged)) === 3);
  check(
    'merge: page order preserved',
    JSON.stringify(await pageSizes(merged)) === JSON.stringify([[200, 200], [300, 300], [400, 400]])
  );
  check('merge: output is a valid PDF', new TextDecoder().decode(merged.slice(0, 5)) === '%PDF-');
}

console.log('split');
{
  const src = await makePdf([[200, 200], [300, 300], [400, 400], [500, 500]], ['1', '2', '3', '4']);
  const ranges = await splitPdf(src, 'ranges', { ranges: '1-2, 4' });
  check('split ranges: one output', ranges.length === 1);
  check('split ranges: 3 pages', (await countPages(ranges[0].bytes)) === 3);
  check(
    'split ranges: correct pages',
    JSON.stringify(await pageSizes(ranges[0].bytes)) === JSON.stringify([[200, 200], [300, 300], [500, 500]])
  );
  const every = await splitPdf(src, 'every', { everyN: 2 });
  check('split every-2: two outputs', every.length === 2);
  check('split every-2: 2 pages each', (await countPages(every[0].bytes)) === 2 && (await countPages(every[1].bytes)) === 2);
  const each = await splitPdf(src, 'each');
  check('split each: four outputs', each.length === 4);
  check('split each: 1 page each', (await countPages(each[0].bytes)) === 1);
}

console.log('parsePageRanges');
{
  check('ranges "1-3, 5" -> [0,1,2,4]', JSON.stringify(parsePageRanges('1-3, 5', 10)) === '[0,1,2,4]');
  check('reversed range "3-1" normalised', JSON.stringify(parsePageRanges('3-1', 10)) === '[0,1,2]');
  await expectThrow('out of range throws', () => parsePageRanges('1-99', 5), /between 1 and 5/);
  await expectThrow('garbage throws', () => parsePageRanges('abc', 5), /Could not understand/);
  await expectThrow('empty throws', () => parsePageRanges('', 5), /Enter the pages/);
}

console.log('rotate / organise');
{
  const src = await makePdf([[200, 200], [300, 300], [400, 400]]);
  const rotated = await transformPages(src, [
    { index: 0, rotate: 90, include: true },
    { index: 1, rotate: 0, include: true },
    { index: 2, rotate: 0, include: true },
  ]);
  check('rotate: page 0 is 90 degrees', (await pageRotations(rotated))[0] === 90);
  check('rotate: other pages untouched', (await pageRotations(rotated))[1] === 0);

  // Rotation ADDS to existing rotation, never overwrites.
  const preRotatedDoc = await PDFDocument.load(src);
  preRotatedDoc.getPage(0).setRotation(degrees(90));
  const preRotated = await preRotatedDoc.save();
  const added = await transformPages(preRotated, [{ index: 0, rotate: 90, include: true }]);
  check('rotate: 90 + 90 = 180 (adds, not overwrites)', (await pageRotations(added))[0] === 180);

  // Delete + reorder: keep page 3 first, then page 1; drop page 2.
  const organised = await transformPages(src, [
    { index: 2, rotate: 0, include: true },
    { index: 1, rotate: 0, include: false },
    { index: 0, rotate: 0, include: true },
  ]);
  check('organise: 2 pages kept', (await countPages(organised)) === 2);
  check(
    'organise: order is [400, 200]',
    JSON.stringify(await pageSizes(organised)) === JSON.stringify([[400, 400], [200, 200]])
  );
  await expectThrow('organise: removing all pages throws', () =>
    transformPages(src, [
      { index: 0, rotate: 0, include: false },
      { index: 1, rotate: 0, include: false },
    ])
  , /at least one page/);
}

console.log('images to PDF');
{
  const png = makePng(300, 200, [200, 40, 40]);
  const pdf = await imagesToPdf([{ bytes: png, type: 'image/png', name: 'red.png' }]);
  check('jpg-to-pdf: 1 image -> 1 page', (await countPages(pdf)) === 1);
  const doc = await PDFDocument.load(pdf);
  const page = doc.getPage(0);
  check('jpg-to-pdf: page is A4', page.getWidth() === 595 && page.getHeight() === 842);
  const png2 = makePng(100, 100, [40, 40, 200]);
  const pdf2 = await imagesToPdf([
    { bytes: png, type: 'image/png', name: 'a.png' },
    { bytes: png2, type: 'image/png', name: 'b.png' },
  ]);
  check('jpg-to-pdf: 2 images -> 2 pages', (await countPages(pdf2)) === 2);
}

console.log('error handling');
{
  await expectThrow('garbage bytes throw', () => loadPdf(new Uint8Array([1, 2, 3, 4])), /./);
  const onePage = await makePdf([[200, 200]]);
  check('countPages works', (await countPages(onePage)) === 1);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
