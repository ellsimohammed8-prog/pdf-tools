// Rotate / Organise pages — thumbnails of every page, rotate in 90° steps,
// remove pages, reorder them, then download the result.
import {
  downloadBytes,
  formatBytes,
  readFileAsBytes,
  wireDropzone,
  showResult,
  hideResult,
  baseName,
  el,
  setProgress,
} from '../lib/utils.js';
import { transformPages, pageRotations } from '../lib/pdf-tools.js';
import { openPdfjs, renderPageThumbnail } from '../lib/pdfjs.js';

const zone = document.getElementById('dropzone');
const input = document.getElementById('file-input');
const resultBox = document.getElementById('result');
const infoBox = document.getElementById('file-info');
const saveBtn = document.getElementById('save-btn');
const clearBtn = document.getElementById('clear-btn');
const grid = document.getElementById('page-grid');
const progressWrap = document.getElementById('progress-wrap');
const progressBar = document.getElementById('progress-bar');
const progressLabel = document.getElementById('progress-label');

let current = null; // { file, bytes, pages }
let pages = []; // { index, rotate (added degrees), include }

wireDropzone(zone, input, async (fileList) => {
  const file = fileList[0];
  if (!file) return;
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    showResult(resultBox, false, `<strong>"${file.name}" is not a PDF.</strong> Only PDF files can be organised here.`);
    return;
  }
  hideResult(resultBox);
  grid.innerHTML = '';
  try {
    const bytes = await readFileAsBytes(file);
    const rotations = await pageRotations(bytes);
    current = { file, bytes, pages: rotations.length };
    pages = rotations.map((angle, index) => ({ index, rotate: 0, include: true, baseAngle: angle }));
    infoBox.textContent = `${file.name} — ${rotations.length} pages · ${formatBytes(file.size)}`;
    infoBox.style.display = 'block';
    saveBtn.disabled = false;
    clearBtn.disabled = false;
    await renderThumbnails(bytes);
  } catch (err) {
    showResult(resultBox, false, `<strong>Could not read "${file.name}".</strong> ${err.message}`);
  }
});

async function renderThumbnails(bytes) {
  setProgress(progressWrap, progressBar, progressLabel, 0, pages.length, 'Loading page previews…');
  const pdf = await openPdfjs(bytes);
  for (let i = 0; i < pages.length; i++) {
    const thumb = await renderPageThumbnail(pdf, pages[i].index + 1);
    pages[i].thumb = thumb;
    setProgress(progressWrap, progressBar, progressLabel, i + 1, pages.length, `Loading page previews… (${i + 1} of ${pages.length})`);
  }
  setProgress(progressWrap, progressBar, progressLabel, null);
  renderGrid();
}

function renderGrid() {
  grid.innerHTML = '';
  pages.forEach((page, pos) => {
    const card = el('div', `page-card${page.include ? '' : ' removed'}`);
    if (page.thumb) {
      const img = document.createElement('img');
      img.src = page.thumb;
      img.alt = `Page ${page.index + 1} preview`;
      img.style.transform = `rotate(${page.rotate}deg)`;
      card.appendChild(img);
    }
    const num = el('div', 'page-num', `Page ${page.index + 1}`);
    if (page.rotate) {
      const badge = el('span', 'rot-badge', ` · +${page.rotate}°`);
      num.appendChild(badge);
    }
    card.appendChild(num);
    const actions = el('div', 'page-actions');
    const rotLeft = el('button', 'icon-btn', '⟲');
    rotLeft.type = 'button';
    rotLeft.title = 'Rotate left (90°)';
    rotLeft.setAttribute('aria-label', `Rotate page ${page.index + 1} left`);
    rotLeft.addEventListener('click', () => {
      page.rotate = (page.rotate + 270) % 360;
      renderGrid();
    });
    const rotRight = el('button', 'icon-btn', '⟳');
    rotRight.type = 'button';
    rotRight.title = 'Rotate right (90°)';
    rotRight.setAttribute('aria-label', `Rotate page ${page.index + 1} right`);
    rotRight.addEventListener('click', () => {
      page.rotate = (page.rotate + 90) % 360;
      renderGrid();
    });
    const moveLeft = el('button', 'icon-btn', '←');
    moveLeft.type = 'button';
    moveLeft.title = 'Move left';
    moveLeft.setAttribute('aria-label', `Move page ${page.index + 1} earlier`);
    moveLeft.disabled = pos === 0;
    moveLeft.addEventListener('click', () => {
      [pages[pos - 1], pages[pos]] = [pages[pos], pages[pos - 1]];
      renderGrid();
    });
    const moveRight = el('button', 'icon-btn', '→');
    moveRight.type = 'button';
    moveRight.title = 'Move right';
    moveRight.setAttribute('aria-label', `Move page ${page.index + 1} later`);
    moveRight.disabled = pos === pages.length - 1;
    moveRight.addEventListener('click', () => {
      [pages[pos + 1], pages[pos]] = [pages[pos], pages[pos + 1]];
      renderGrid();
    });
    const remove = el('button', 'icon-btn danger', '×');
    remove.type = 'button';
    remove.title = page.include ? 'Remove page' : 'Restore page';
    remove.setAttribute('aria-label', `${page.include ? 'Remove' : 'Restore'} page ${page.index + 1}`);
    remove.textContent = page.include ? '×' : '↺';
    remove.addEventListener('click', () => {
      page.include = !page.include;
      renderGrid();
    });
    actions.append(rotLeft, rotRight, moveLeft, moveRight, remove);
    card.appendChild(actions);
    grid.appendChild(card);
  });
}

clearBtn.addEventListener('click', () => {
  current = null;
  pages = [];
  grid.innerHTML = '';
  infoBox.style.display = 'none';
  saveBtn.disabled = true;
  clearBtn.disabled = true;
  hideResult(resultBox);
});

saveBtn.addEventListener('click', async () => {
  if (!current) return;
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';
  hideResult(resultBox);
  try {
    const ops = pages.map((p) => ({ index: p.index, rotate: p.rotate, include: p.include }));
    const bytes = await transformPages(current.bytes, ops);
    const kept = pages.filter((p) => p.include).length;
    const name = `${baseName(current.file.name)}-organised.pdf`;
    downloadBytes(bytes, name);
    showResult(
      resultBox,
      true,
      `<strong>Done — your PDF now has ${kept} page${kept === 1 ? '' : 's'} (${formatBytes(bytes.length)}).</strong><br>` +
        `Your file <strong>${name}</strong> should have downloaded.` +
        `<div class="result-actions"><button class="btn btn-secondary" id="download-again" type="button">Download again</button></div>`
    );
    document.getElementById('download-again').addEventListener('click', () => downloadBytes(bytes, name));
  } catch (err) {
    showResult(resultBox, false, `<strong>Saving failed.</strong> ${err.message}`);
  } finally {
    saveBtn.disabled = !current;
    saveBtn.textContent = 'Download PDF';
  }
});
