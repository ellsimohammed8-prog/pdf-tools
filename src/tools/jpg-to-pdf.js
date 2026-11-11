// JPG to PDF — upload images, reorder them, convert to one PDF (A4 pages).
import {
  downloadBytes,
  formatBytes,
  readFileAsBytes,
  wireDropzone,
  showResult,
  hideResult,
  baseName,
  el,
} from '../lib/utils.js';
import { imagesToPdf } from '../lib/pdf-tools.js';

const zone = document.getElementById('dropzone');
const input = document.getElementById('file-input');
const list = document.getElementById('file-list');
const convertBtn = document.getElementById('convert-btn');
const clearBtn = document.getElementById('clear-btn');
const resultBox = document.getElementById('result');
const countLabel = document.getElementById('file-count');

const images = []; // { file, bytes, type }

wireDropzone(zone, input, addFiles);

async function addFiles(fileList) {
  hideResult(resultBox);
  for (const file of fileList) {
    const ok =
      file.type === 'image/jpeg' ||
      file.type === 'image/png' ||
      /\.(jpe?g|png)$/i.test(file.name);
    if (!ok) {
      showResult(resultBox, false, `<strong>Skipped "${file.name}"</strong> — only JPG and PNG images work here.`);
      continue;
    }
    const bytes = await readFileAsBytes(file);
    const type = file.type === 'image/png' || /\.png$/i.test(file.name) ? 'image/png' : 'image/jpeg';
    images.push({ file, bytes, type });
  }
  renderList();
}

function renderList() {
  list.innerHTML = '';
  images.forEach((entry, i) => {
    const li = el('li', 'file-item');
    li.appendChild(el('span', 'file-name', `${i + 1}. ${entry.file.name}`));
    li.appendChild(el('span', 'file-meta', `${entry.type === 'image/png' ? 'PNG' : 'JPG'} · ${formatBytes(entry.file.size)}`));
    const actions = el('span', 'file-actions');
    const up = el('button', 'icon-btn', '↑');
    up.type = 'button';
    up.title = 'Move up';
    up.setAttribute('aria-label', `Move ${entry.file.name} up`);
    up.disabled = i === 0;
    up.addEventListener('click', () => {
      [images[i - 1], images[i]] = [images[i], images[i - 1]];
      renderList();
    });
    const down = el('button', 'icon-btn', '↓');
    down.type = 'button';
    down.title = 'Move down';
    down.setAttribute('aria-label', `Move ${entry.file.name} down`);
    down.disabled = i === images.length - 1;
    down.addEventListener('click', () => {
      [images[i + 1], images[i]] = [images[i], images[i + 1]];
      renderList();
    });
    const remove = el('button', 'icon-btn danger', '×');
    remove.type = 'button';
    remove.title = 'Remove';
    remove.setAttribute('aria-label', `Remove ${entry.file.name}`);
    remove.addEventListener('click', () => {
      images.splice(i, 1);
      renderList();
    });
    actions.append(up, down, remove);
    li.appendChild(actions);
    list.appendChild(li);
  });
  countLabel.textContent =
    images.length === 0
      ? 'No images yet — add at least one JPG or PNG.'
      : `${images.length} image${images.length === 1 ? '' : 's'} · will become ${images.length} page${images.length === 1 ? '' : 's'}`;
  convertBtn.disabled = images.length === 0;
  clearBtn.disabled = images.length === 0;
}

clearBtn.addEventListener('click', () => {
  images.length = 0;
  hideResult(resultBox);
  renderList();
});

convertBtn.addEventListener('click', async () => {
  if (!images.length) return;
  convertBtn.disabled = true;
  convertBtn.textContent = 'Converting…';
  hideResult(resultBox);
  try {
    const bytes = await imagesToPdf(images);
    const name = `${baseName(images[0].file.name)}-converted.pdf`;
    downloadBytes(bytes, name);
    showResult(
      resultBox,
      true,
      `<strong>Done — ${images.length} image${images.length === 1 ? '' : 's'} converted to one PDF (${formatBytes(bytes.length)}).</strong><br>` +
        `Your file <strong>${name}</strong> should have downloaded.` +
        `<div class="result-actions"><button class="btn btn-secondary" id="download-again" type="button">Download again</button></div>`
    );
    document.getElementById('download-again').addEventListener('click', () => downloadBytes(bytes, name));
  } catch (err) {
    showResult(resultBox, false, `<strong>Conversion failed.</strong> ${err.message}`);
  } finally {
    convertBtn.disabled = images.length === 0;
    convertBtn.textContent = 'Convert to PDF';
  }
});

renderList();
