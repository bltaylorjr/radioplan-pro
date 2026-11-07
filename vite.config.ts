import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `--mode usb` produces ONE self-contained HTML file (dist-usb/RadioPlan.html)
// that opens straight from a USB stick via file:// with no install or server.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'usb' ? [react(), viteSingleFile()] : [react()],
  build: {
    outDir: mode === 'usb' ? 'dist-usb' : 'dist',
    rollupOptions: mode === 'usb' ? { input: 'RadioPlan.html' } : undefined,
    chunkSizeWarningLimit: 4000,
  },
  test: { globals: true, environment: 'node', include: ['tests/**/*.test.ts'] },
}));
