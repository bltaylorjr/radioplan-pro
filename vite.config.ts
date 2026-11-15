import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Big data files are saved for offline use after the app is ready, not before it can start. */
const EXTRA = /\/(nc|sc|ga|tn|va|airports|ashevilleTerrain)-[\w-]+\.js$/;

/** Online version only: write sw.js listing every program file so the site keeps working offline. */
function offlineServiceWorker(): Plugin {
  return {
    name: 'lvplan-offline-sw',
    apply: 'build',
    generateBundle(_o, bundle) {
      const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const pub = readdirSync('public').filter((f) => statSync(join('public', f)).isFile() && !/\.(mp4|webm)$/i.test(f));
      const all = [...new Set([...files, ...pub])].filter((f) => f !== 'sw.js');
      const core = ['./', ...all.filter((f) => !EXTRA.test('/' + f))];
      const extra = all.filter((f) => EXTRA.test('/' + f));
      const stamp = pkg.version + '-' + Date.now().toString(36);
      const src = readFileSync('packaging/web/sw.js', 'utf8')
        .replace("'__VERSION__';", JSON.stringify(stamp) + ';').replace('= __CORE__;', '= ' + JSON.stringify(core) + ';').replace('= __EXTRA__;', '= ' + JSON.stringify(extra) + ';');
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: src });
    },
  };
}

// `--mode usb` produces ONE self-contained HTML file (dist-usb/RadioPlan.html)
// that opens straight from a USB stick via file:// with no install or server.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'usb' ? [react(), viteSingleFile()] : [react(), offlineServiceWorker()],
  build: {
    outDir: mode === 'usb' ? 'dist-usb' : 'dist',
    rollupOptions: mode === 'usb' ? { input: 'RadioPlan.html' } : {
      output: {
        // Libraries change rarely: keep them in their own files so an app update downloads less.
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
          if (/node_modules\/leaflet\/.*\.js$/.test(id)) return 'leaflet';
          if (/node_modules\/three\//.test(id)) return 'three';
        },
      },
    },
    chunkSizeWarningLimit: 4000,
  },
  test: { globals: true, environment: 'node', include: ['tests/**/*.test.ts'] },
}));
