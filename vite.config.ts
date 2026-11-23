
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {viteStaticCopy} from 'vite-plugin-static-copy';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    ...viteStaticCopy({
      targets: [
        {
          src: 'manifest.json',
          dest: '.'
        },
        {
          src: 'metadata.json',
          dest: '.'
        },
        {
          src: '_locales/**/*',
          dest: '_locales'
        },
        {
          src: 'icons/**/*',
          dest: 'icons'
        }
      ]
    }).filter((plugin) => plugin.apply !== 'serve')
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true
  },
  build: {
    rollupOptions: {
      input: {
        index: resolve('index.html'),
        popup: resolve('popup.html'),
        panel: resolve('panel.html'),
        devtools: resolve('devtools.html'),
        background: resolve('background.ts'),
        'mock-bridge': resolve('mock-bridge.ts'),
        'mock-injector': resolve('mock-injector.ts')
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
      }
    },
    outDir: 'dist',
    emptyOutDir: true
  }
});
