// Lazy PDF.js loader — self-hosted worker, cmaps and standard fonts.
// Nothing here is imported by the homepage, so the ~1.6 MB PDF.js bundle
// only downloads when a visitor actually opens a tool that needs it.

let pdfjsPromise = null;

export function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist');
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

/** Open a PDF with PDF.js (used for rendering and text extraction). */
export async function openPdfjs(bytes) {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({
    data: bytes.slice().buffer,
    cMapUrl: '/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/standard_fonts/',
  });
  return task.promise;
}

/**
 * Render one page to a JPEG data URL.
 * Canvas size is capped at ~16M pixels (Safari refuses larger canvases).
 * Renders one page at a time — callers must not Promise.all this.
 */
export async function renderPageToJpeg(pdf, pageNumber, scale, jpegQuality) {
  const MAX_CANVAS_PIXELS = 16_000_000;
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  let s = scale;
  const pixels = base.width * s * base.height * s;
  if (pixels > MAX_CANVAS_PIXELS) {
    s = Math.sqrt(MAX_CANVAS_PIXELS / (base.width * base.height));
  }
  const viewport = page.getViewport({ scale: s });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  const dataUrl = canvas.toDataURL('image/jpeg', jpegQuality);
  page.cleanup();
  return dataUrl;
}

/** Render one page to a small thumbnail data URL (for the rotate tool). */
export async function renderPageThumbnail(pdf, pageNumber) {
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(150 / base.width, 200 / base.height, 1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
  page.cleanup();
  return dataUrl;
}
