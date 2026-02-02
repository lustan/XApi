
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {viteStaticCopy} from 'vite-plugin-static-copy';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
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
    })
  ],
  build: {
    rollupOptions: {
      input: {
        popup: resolve('popup.html'),
        panel: resolve('panel.html'),
        devtools: resolve('devtools.html'),
        background: resolve('background.ts') 
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
