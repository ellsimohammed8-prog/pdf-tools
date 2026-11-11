import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Static site only. Served from the domain root on Cloudflare Pages.
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        merge: resolve(root, 'merge-pdf/index.html'),
        split: resolve(root, 'split-pdf/index.html'),
        compress: resolve(root, 'compress-pdf/index.html'),
        jpg2pdf: resolve(root, 'jpg-to-pdf/index.html'),
        rotate: resolve(root, 'rotate-pdf/index.html'),
      },
    },
  },
});
