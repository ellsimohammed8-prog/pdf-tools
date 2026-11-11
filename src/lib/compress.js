// Compress a PDF by rasterising each page to a JPEG image and rebuilding
// the PDF from those images. Honest trade-off, stated on the tool page:
// text becomes an image — it is no longer selectable or searchable — and
// the win is biggest on scanned or image-heavy PDFs. Text-heavy PDFs
// may barely shrink, or even grow. This runs 100% in the browser.

import { openPdfjs, renderPageToJpeg } from './pdfjs.js';
import { getPdfLib } from './pdf-tools.js';

export const COMPRESS_PRESETS = {
  small: { label: 'Smallest file', scale: 1.0, quality: 0.45 },
  medium: { label: 'Balanced', scale: 1.5, quality: 0.65 },
  high: { label: 'Best quality', scale: 2.0, quality: 0.85 },
};

function dataUrlToBytes(dataUrl) {
  const b64 = dataUrl.split(',')[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Compress a PDF.
 * @param {Uint8Array} bytes - the source PDF
 * @param {{ scale: number, quality: number }} options
 * @param {(done: number, total: number) => void} onProgress
 * @returns {Promise<{ bytes: Uint8Array, pages: number }>}
 */
export async function compressPdf(bytes, options, onProgress) {
  const { PDFDocument } = await getPdfLib();
  const pdf = await openPdfjs(bytes);
  const total = pdf.numPages;
  const out = await PDFDocument.create();

  // One page at a time: rendering in parallel would blow up memory.
  for (let i = 1; i <= total; i++) {
    const dataUrl = await renderPageToJpeg(pdf, i, options.scale, options.quality);
    const jpgBytes = dataUrlToBytes(dataUrl);
    const jpg = await out.embedJpg(jpgBytes);
    const page = out.addPage([jpg.width, jpg.height]);
    page.drawImage(jpg, { x: 0, y: 0, width: jpg.width, height: jpg.height });
    if (onProgress) onProgress(i, total);
  }

  const outBytes = await out.save();
  return { bytes: outBytes, pages: total };
}
