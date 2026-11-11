// Compress PDF — rasterise pages to JPEG and rebuild the PDF.
// Honest by design: the page warns that text becomes images.
import {
  downloadBytes,
  formatBytes,
  readFileAsBytes,
  wireDropzone,
  showResult,
  hideResult,
  baseName,
  setProgress,
} from '../lib/utils.js';
import { compressPdf, COMPRESS_PRESETS } from '../lib/compress.js';
import { countPages } from '../lib/pdf-tools.js';

const zone = document.getElementById('dropzone');
const input = document.getElementById('file-input');
const resultBox = document.getElementById('result');
const infoBox = document.getElementById('file-info');
const compressBtn = document.getElementById('compress-btn');
const clearBtn = document.getElementById('clear-btn');
const qualitySlider = document.getElementById('quality-slider');
const qualityValue = document.getElementById('quality-value');
const progressWrap = document.getElementById('progress-wrap');
const progressBar = document.getElementById('progress-bar');
const progressLabel = document.getElementById('progress-label');

let current = null; // { file, bytes, pages }
let preset = 'medium';

wireDropzone(zone, input, async (fileList) => {
  const file = fileList[0];
  if (!file) return;
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    showResult(resultBox, false, `<strong>"${file.name}" is not a PDF.</strong> Only PDF files can be compressed here.`);
    return;
  }
  hideResult(resultBox);
  try {
    const bytes = await readFileAsBytes(file);
    const pages = await countPages(bytes);
    current = { file, bytes, pages };
    infoBox.textContent = `${file.name} — ${pages} pages · ${formatBytes(file.size)}`;
    infoBox.style.display = 'block';
    compressBtn.disabled = false;
    clearBtn.disabled = false;
  } catch (err) {
    showResult(resultBox, false, `<strong>Could not read "${file.name}".</strong> ${err.message}`);
  }
});

document.querySelectorAll('input[name="preset"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    preset = radio.value;
    const p = COMPRESS_PRESETS[preset];
    qualitySlider.value = Math.round(p.quality * 100);
    qualityValue.textContent = `${qualitySlider.value}%`;
  });
});

qualitySlider.addEventListener('input', () => {
  qualityValue.textContent = `${qualitySlider.value}%`;
});

clearBtn.addEventListener('click', () => {
  current = null;
  infoBox.style.display = 'none';
  compressBtn.disabled = true;
  clearBtn.disabled = true;
  hideResult(resultBox);
  setProgress(progressWrap, progressBar, progressLabel, null);
});

compressBtn.addEventListener('click', async () => {
  if (!current) return;
  compressBtn.disabled = true;
  compressBtn.textContent = 'Compressing…';
  hideResult(resultBox);
  const scale = COMPRESS_PRESETS[preset].scale;
  const quality = parseInt(qualitySlider.value, 10) / 100;
  try {
    const { bytes, pages } = await compressPdf(current.bytes, { scale, quality }, (done, total) => {
      setProgress(progressWrap, progressBar, progressLabel, done, total, `Processing page ${done} of ${total}…`);
    });
    setProgress(progressWrap, progressBar, progressLabel, null);
    const before = current.file.size;
    const after = bytes.length;
    const saved = before > 0 ? Math.round(((before - after) / before) * 100) : 0;
    const name = `${baseName(current.file.name)}-compressed.pdf`;
    downloadBytes(bytes, name);
    const verdict =
      saved > 0
        ? `<strong>Done — ${formatBytes(before)} → ${formatBytes(after)} (saved ${saved}%).</strong>`
        : `<strong>Done — the new file is ${formatBytes(after)} (was ${formatBytes(before)}).</strong> This PDF was mostly text, so image compression could not shrink it much — that is normal.`;
    showResult(
      resultBox,
      true,
      `${verdict}<br>Your file <strong>${name}</strong> should have downloaded. ` +
        `Remember: text in this file is now an image — it can no longer be selected or searched.` +
        `<div class="result-actions"><button class="btn btn-secondary" id="download-again" type="button">Download again</button></div>`
    );
    document.getElementById('download-again').addEventListener('click', () => downloadBytes(bytes, name));
  } catch (err) {
    setProgress(progressWrap, progressBar, progressLabel, null);
    showResult(resultBox, false, `<strong>Compression failed.</strong> ${err.message}`);
  } finally {
    compressBtn.disabled = !current;
    compressBtn.textContent = 'Compress PDF';
  }
});
