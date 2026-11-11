// Pure PDF operations: byte arrays in, byte arrays out.
// pdf-lib is loaded lazily (dynamic import) so it never lands in the
// homepage bundle — it only downloads when a visitor actually uses a tool.
// These functions run in the browser and in Node (for tests).

let libPromise = null;
export function getPdfLib() {
  if (!libPromise) libPromise = import('pdf-lib');
  return libPromise;
}

const ENCRYPTED_HINT = /encrypt/i;

/** Load a PDF, turning the cryptic pdf-lib encryption error into a clear one. */
export async function loadPdf(bytes) {
  const { PDFDocument } = await getPdfLib();
  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: false });
  } catch (err) {
    if (err && ENCRYPTED_HINT.test(err.message || '')) {
      throw new Error(
        'This PDF is password-protected. Please unlock it first (for example with your PDF reader) and then try again — protected files cannot be edited in the browser.'
      );
    }
    throw err;
  }
}

export async function countPages(bytes) {
  const doc = await loadPdf(bytes);
  return doc.getPageCount();
}

/** Merge several PDFs into one, in the given order. */
export async function mergePdfs(buffers) {
  const { PDFDocument } = await getPdfLib();
  const out = await PDFDocument.create();
  for (const buf of buffers) {
    const src = await loadPdf(buf);
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const page of pages) out.addPage(page);
  }
  return out.save();
}

/**
 * Parse a page-range string like "1-3, 5, 7-9" into 0-based page indices.
 * Throws a plain-words Error on bad input. Pages are 1-based for humans.
 */
export function parsePageRanges(spec, totalPages) {
  if (!spec || !spec.trim()) throw new Error('Enter the pages you want, for example "1-3, 5".');
  const indices = [];
  const parts = spec.split(',');
  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) continue;
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      let start = parseInt(range[1], 10);
      let end = parseInt(range[2], 10);
      if (start > end) [start, end] = [end, start];
      if (start < 1 || end > totalPages) {
        throw new Error(`Pages must be between 1 and ${totalPages}. "${part}" is out of range.`);
      }
      for (let p = start; p <= end; p++) indices.push(p - 1);
    } else if (/^\d+$/.test(part)) {
      const p = parseInt(part, 10);
      if (p < 1 || p > totalPages) {
        throw new Error(`Pages must be between 1 and ${totalPages}. Page ${p} does not exist.`);
      }
      indices.push(p - 1);
    } else {
      throw new Error(`Could not understand "${part}". Use numbers and ranges like "1-3, 5".`);
    }
  }
  if (!indices.length) throw new Error('Enter the pages you want, for example "1-3, 5".');
  return indices;
}

/**
 * Split a PDF.
 * mode 'ranges': one output PDF with the given pages (spec like "1-3, 5").
 * mode 'every':  one output PDF per block of N pages.
 * mode 'each':   one output PDF per page.
 * Returns [{ name, bytes }]. Names are filled in by the caller when needed.
 */
export async function splitPdf(bytes, mode, opts = {}) {
  const { PDFDocument } = await getPdfLib();
  const src = await loadPdf(bytes);
  const total = src.getPageCount();
  const outputs = [];

  const build = async (indices) => {
    const out = await PDFDocument.create();
    const pages = await out.copyPages(src, indices);
    for (const page of pages) out.addPage(page);
    return out.save();
  };

  if (mode === 'ranges') {
    const indices = parsePageRanges(opts.ranges, total);
    outputs.push({ bytes: await build(indices) });
  } else if (mode === 'every') {
    const n = Math.max(1, Math.floor(opts.everyN || 1));
    for (let start = 0; start < total; start += n) {
      const indices = [];
      for (let p = start; p < Math.min(start + n, total); p++) indices.push(p);
      outputs.push({ bytes: await build(indices) });
    }
  } else if (mode === 'each') {
    for (let p = 0; p < total; p++) {
      outputs.push({ bytes: await build([p]) });
    }
  } else {
    throw new Error(`Unknown split mode "${mode}".`);
  }
  return outputs;
}

/**
 * Rotate / delete / reorder pages in one pass.
 * ops: [{ index (0-based original page), rotate (degrees to ADD), include (bool) }]
 * Rotation is ADDED to the page's existing rotation — never overwritten.
 */
export async function transformPages(bytes, ops) {
  const { PDFDocument, degrees } = await getPdfLib();
  const src = await loadPdf(bytes);
  const out = await PDFDocument.create();
  for (const op of ops) {
    if (!op.include) continue;
    const [page] = await out.copyPages(src, [op.index]);
    const current = page.getRotation().angle;
    const next = (((current + (op.rotate || 0)) % 360) + 360) % 360;
    page.setRotation(degrees(next));
    out.addPage(page);
  }
  if (out.getPageCount() === 0) throw new Error('All pages were removed — keep at least one page.');
  return out.save();
}

/** Read the current rotation (in degrees) of every page. */
export async function pageRotations(bytes) {
  const src = await loadPdf(bytes);
  return src.getPages().map((p) => p.getRotation().angle);
}

const MAX_PAGE_DIMENSION_PT = 842; // A4 long edge, in PDF points

/** Turn images (JPEG/PNG) into a PDF, one image per page, fitted to A4. */
export async function imagesToPdf(images) {
  const { PDFDocument } = await getPdfLib();
  const out = await PDFDocument.create();
  for (const img of images) {
    const embedded =
      img.type === 'image/png' ? await out.embedPng(img.bytes) : await out.embedJpg(img.bytes);
    const scale = Math.min(
      MAX_PAGE_DIMENSION_PT / embedded.width,
      MAX_PAGE_DIMENSION_PT / embedded.height,
      1
    );
    const width = embedded.width * scale;
    const height = embedded.height * scale;
    const page = out.addPage([595, 842]); // A4 portrait
    page.drawImage(embedded, {
      x: (595 - width) / 2,
      y: (842 - height) / 2,
      width,
      height,
    });
  }
  return out.save();
}
