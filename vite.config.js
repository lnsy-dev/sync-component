import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'build',
    minify: 'oxc',
    rolldownOptions: {
      output: {
        minify: true
      }
    },
    lib: {
      entry: 'src/sync-component.js',
      name: 'SyncComponent',
      formats: ['es'],
      fileName: 'sync-component.min'
    }
  }
});
