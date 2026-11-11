// Split / Extract pages — three modes: page ranges, every N pages, each page.
// Multiple outputs are offered as a ZIP (JSZip, loaded lazily).
import {
  downloadBytes,
  formatBytes,
  readFileAsBytes,
  wireDropzone,
  showResult,
  hideResult,
  baseName,
} from '../lib/utils.js';
import { splitPdf, countPages } from '../lib/pdf-tools.js';

const zone = document.getElementById('dropzone');
const input = document.getElementById('file-input');
const resultBox = document.getElementById('result');
const infoBox = document.getElementById('file-info');
const splitBtn = document.getElementById('split-btn');
const clearBtn = document.getElementById('clear-btn');
const modeInputs = document.querySelectorAll('input[name="split-mode"]');
const rangesField = document.getElementById('ranges-field');
const rangesInput = document.getElementById('ranges-input');
const everyField = document.getElementById('every-field');
const everyInput = document.getElementById('every-input');
const progressWrap = document.getElementById('progress-wrap');
const progressBar = document.getElementById('progress-bar');
const progressLabel = document.getElementById('progress-label');

let current = null; // { file, bytes, pages }

wireDropzone(zone, input, async (fileList) => {
  const file = fileList[0];
  if (!file) return;
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    showResult(resultBox, false, `<strong>"${file.name}" is not a PDF.</strong> Only PDF files can be split here.`);
    return;
  }
  hideResult(resultBox);
  try {
    const bytes = await readFileAsBytes(file);
    const pages = await countPages(bytes);
    current = { file, bytes, pages };
    infoBox.textContent = `${file.name} — ${pages} pages · ${formatBytes(file.size)}`;
    infoBox.style.display = 'block';
    splitBtn.disabled = false;
    clearBtn.disabled = false;
  } catch (err) {
    showResult(resultBox, false, `<strong>Could not read "${file.name}".</strong> ${err.message}`);
  }
});

modeInputs.forEach((radio) => {
  radio.addEventListener('change', () => {
    rangesField.style.display = radio.value === 'ranges' && radio.checked ? 'block' : 'none';
    everyField.style.display = radio.value === 'every' && radio.checked ? 'block' : 'none';
  });
});

clearBtn.addEventListener('click', () => {
  current = null;
  infoBox.style.display = 'none';
  splitBtn.disabled = true;
  clearBtn.disabled = true;
  hideResult(resultBox);
});

function selectedMode() {
  return document.querySelector('input[name="split-mode"]:checked').value;
}

splitBtn.addEventListener('click', async () => {
  if (!current) return;
  const mode = selectedMode();
  splitBtn.disabled = true;
  splitBtn.textContent = 'Splitting…';
  hideResult(resultBox);
  try {
    const outputs = await splitPdf(current.bytes, mode, {
      ranges: rangesInput.value,
      everyN: parseInt(everyInput.value, 10),
    });
    const stem = baseName(current.file.name);
    if (outputs.length === 1) {
      const name = `${stem}-split.pdf`;
      downloadBytes(outputs[0].bytes, name);
      showResult(
        resultBox,
        true,
        `<strong>Done — your new PDF is ready (${formatBytes(outputs[0].bytes.length)}).</strong><br>` +
          `Your file <strong>${name}</strong> should have downloaded.` +
          `<div class="result-actions"><button class="btn btn-secondary" id="download-again" type="button">Download again</button></div>`
      );
      document.getElementById('download-again').addEventListener('click', () => downloadBytes(outputs[0].bytes, name));
    } else {
      // Offer a ZIP of all parts.
      progressWrap.classList.add('visible');
      progressLabel.textContent = 'Preparing ZIP…';
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      outputs.forEach((out, i) => {
        zip.file(`${stem}-part-${i + 1}.pdf`, out.bytes);
      });
      const zipBytes = await zip.generateAsync({ type: 'uint8array' });
      progressWrap.classList.remove('visible');
      const zipName = `${stem}-split.zip`;
      downloadBytes(zipBytes, zipName, 'application/zip');
      showResult(
        resultBox,
        true,
        `<strong>Done — ${outputs.length} PDFs created.</strong><br>` +
          `They are packed in <strong>${zipName}</strong> (${formatBytes(zipBytes.length)}). It should have downloaded.` +
          `<div class="result-actions"><button class="btn btn-secondary" id="download-again" type="button">Download ZIP again</button></div>`
      );
      document.getElementById('download-again').addEventListener('click', () => downloadBytes(zipBytes, zipName, 'application/zip'));
    }
  } catch (err) {
    showResult(resultBox, false, `<strong>Splitting failed.</strong> ${err.message}`);
  } finally {
    splitBtn.disabled = !current;
    splitBtn.textContent = 'Split PDF';
  }
});
