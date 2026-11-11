// Shared browser helpers — no PDF logic here, no heavy imports.

export function formatBytes(bytes) {
  if (bytes === 0) return '0 KB';
  const units = ['bytes', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function downloadBytes(bytes, filename, mime = 'application/pdf') {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return blob.size;
}

export function readFileAsBytes(file) {
  return file.arrayBuffer().then((buf) => new Uint8Array(buf));
}

export function baseName(filename) {
  return filename.replace(/\.[^.]+$/, '');
}

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Wire a dropzone (click to browse + drag and drop). Calls onFiles(FileList). */
export function wireDropzone(zone, input, onFiles) {
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  input.addEventListener('change', () => {
    // Snapshot immediately: input.files is a LIVE list, and clearing the
    // input below would empty it while the async handler is still working.
    const files = [...input.files];
    if (files.length) onFiles(files);
    input.value = '';
  });
  for (const evt of ['dragenter', 'dragover']) {
    zone.addEventListener(evt, (e) => {
      e.preventDefault();
      zone.classList.add('dragging');
    });
  }
  for (const evt of ['dragleave', 'drop']) {
    zone.addEventListener(evt, (e) => {
      e.preventDefault();
      zone.classList.remove('dragging');
    });
  }
  zone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]);
  });
}

export function showResult(box, ok, html) {
  box.className = `result visible ${ok ? 'success' : 'error'}`;
  box.innerHTML = html;
}

export function hideResult(box) {
  box.className = 'result';
  box.innerHTML = '';
}

export function setProgress(wrap, bar, label, done, total, text) {
  if (!wrap) return;
  if (done == null) {
    wrap.classList.remove('visible');
    return;
  }
  wrap.classList.add('visible');
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  bar.style.width = `${pct}%`;
  if (label) label.textContent = text || `${done} of ${total} pages`;
}
