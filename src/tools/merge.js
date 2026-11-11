// Merge PDF — upload several PDFs, reorder by drag of the buttons, merge.
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
import { mergePdfs, countPages } from '../lib/pdf-tools.js';

const zone = document.getElementById('dropzone');
const input = document.getElementById('file-input');
const list = document.getElementById('file-list');
const mergeBtn = document.getElementById('merge-btn');
const clearBtn = document.getElementById('clear-btn');
const resultBox = document.getElementById('result');
const countLabel = document.getElementById('file-count');

const files = []; // { file, bytes, pages }

wireDropzone(zone, input, addFiles);

async function addFiles(fileList) {
  hideResult(resultBox);
  for (const file of fileList) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      showResult(resultBox, false, `<strong>Skipped "${file.name}"</strong> — only PDF files can be merged here.`);
      continue;
    }
    try {
      const bytes = await readFileAsBytes(file);
      const pages = await countPages(bytes);
      files.push({ file, bytes, pages });
    } catch (err) {
      showResult(resultBox, false, `<strong>Could not read "${file.name}".</strong> ${err.message}`);
    }
  }
  renderList();
}

function renderList() {
  list.innerHTML = '';
  files.forEach((entry, i) => {
    const li = el('li', 'file-item');
    li.appendChild(el('span', 'file-name', `${i + 1}. ${entry.file.name}`));
    li.appendChild(el('span', 'file-meta', `${entry.pages} page${entry.pages === 1 ? '' : 's'} · ${formatBytes(entry.file.size)}`));
    const actions = el('span', 'file-actions');
    const up = el('button', 'icon-btn', '↑');
    up.type = 'button';
    up.title = 'Move up';
    up.setAttribute('aria-label', `Move ${entry.file.name} up`);
    up.disabled = i === 0;
    up.addEventListener('click', () => {
      [files[i - 1], files[i]] = [files[i], files[i - 1]];
      renderList();
    });
    const down = el('button', 'icon-btn', '↓');
    down.type = 'button';
    down.title = 'Move down';
    down.setAttribute('aria-label', `Move ${entry.file.name} down`);
    down.disabled = i === files.length - 1;
    down.addEventListener('click', () => {
      [files[i + 1], files[i]] = [files[i], files[i + 1]];
      renderList();
    });
    const remove = el('button', 'icon-btn danger', '×');
    remove.type = 'button';
    remove.title = 'Remove';
    remove.setAttribute('aria-label', `Remove ${entry.file.name}`);
    remove.addEventListener('click', () => {
      files.splice(i, 1);
      renderList();
    });
    actions.append(up, down, remove);
    li.appendChild(actions);
    list.appendChild(li);
  });
  const totalPages = files.reduce((sum, f) => sum + f.pages, 0);
  countLabel.textContent =
    files.length === 0
      ? 'No files yet — add at least two PDFs.'
      : `${files.length} file${files.length === 1 ? '' : 's'} · ${totalPages} pages in total`;
  mergeBtn.disabled = files.length < 2;
  clearBtn.disabled = files.length === 0;
}

clearBtn.addEventListener('click', () => {
  files.length = 0;
  hideResult(resultBox);
  renderList();
});

mergeBtn.addEventListener('click', async () => {
  if (files.length < 2) return;
  mergeBtn.disabled = true;
  mergeBtn.textContent = 'Merging…';
  hideResult(resultBox);
  try {
    const bytes = await mergePdfs(files.map((f) => f.bytes));
    const totalPages = files.reduce((sum, f) => sum + f.pages, 0);
    const name = `${baseName(files[0].file.name)}-merged.pdf`;
    downloadBytes(bytes, name);
    showResult(
      resultBox,
      true,
      `<strong>Done — ${files.length} PDFs merged into one (${totalPages} pages, ${formatBytes(bytes.length)}).</strong><br>` +
        `Your file <strong>${name}</strong> should have downloaded. If it did not, use the button below.` +
        `<div class="result-actions"><button class="btn btn-secondary" id="download-again" type="button">Download again</button></div>`
    );
    document.getElementById('download-again').addEventListener('click', () => downloadBytes(bytes, name));
  } catch (err) {
    showResult(resultBox, false, `<strong>Merging failed.</strong> ${err.message}`);
  } finally {
    mergeBtn.disabled = files.length < 2;
    mergeBtn.textContent = 'Merge PDFs';
  }
});

renderList();
