import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, rmSync, readFileSync, writeFileSync, readdirSync } from 'fs';

// Plugin to fix extension structure after build
function fixExtensionStructure() {
  return {
    name: 'fix-extension-structure',
    closeBundle() {
      // Ensure dist/assets exists
      if (!existsSync('dist/assets')) {
        mkdirSync('dist/assets', { recursive: true });
      }

      // Copy manifest
      copyFileSync('manifest.json', 'dist/manifest.json');

      // Copy icons
      const iconsDir = 'assets/icons';
      const distIconsDir = 'dist/assets/icons';
      if (existsSync(iconsDir)) {
        if (!existsSync(distIconsDir)) {
          mkdirSync(distIconsDir, { recursive: true });
        }
        const iconFiles = readdirSync(iconsDir);
        for (const file of iconFiles) {
          if (file.endsWith('.png') || file.endsWith('.svg')) {
            copyFileSync(`${iconsDir}/${file}`, `${distIconsDir}/${file}`);
          }
        }
      }

      // Move HTML files from nested paths to root
      const htmlMoves = [
        ['dist/src/popup/index.html', 'dist/popup.html'],
        ['dist/src/approval/index.html', 'dist/approval.html'],
        ['dist/src/options/index.html', 'dist/options.html'],
        ['dist/src/sidepanel/index.html', 'dist/sidepanel.html'],
      ];

      for (const [from, to] of htmlMoves) {
        if (existsSync(from)) {
          // Read, fix paths, and write
          let content = readFileSync(from, 'utf-8');
          // Fix asset paths - they reference ../../assets/ but should be ./assets/
          content = content.replace(/\.\.\/\.\.\/assets\//g, './assets/');
          content = content.replace(/\/assets\//g, './assets/');
          writeFileSync(to, content);
        }
      }

      // Clean up src directory
      if (existsSync('dist/src')) {
        rmSync('dist/src', { recursive: true, force: true });
      }
    },
  };
}

// Polyfill banner for service worker - must run before any other code
const serviceWorkerPolyfill = `
if (typeof globalThis !== 'undefined' && typeof globalThis.window === 'undefined') {
  globalThis.window = typeof self !== 'undefined' ? self : globalThis;
}
`;

export default defineConfig({
  plugins: [react(), fixExtensionStructure()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/index.ts'),
        content: resolve(__dirname, 'src/content/index.ts'),
        inject: resolve(__dirname, 'src/content/inject.ts'),
        popup: resolve(__dirname, 'src/popup/index.html'),
        approval: resolve(__dirname, 'src/approval/index.html'),
        options: resolve(__dirname, 'src/options/index.html'),
        sidepanel: resolve(__dirname, 'src/sidepanel/index.html'),
      },
      output: {
        banner: (chunk) => {
          // Add polyfill to client chunk (contains cashu-ts) and background
          if (chunk.name === 'client' || chunk.name === 'background') {
            return serviceWorkerPolyfill;
          }
          return '';
        },
        entryFileNames: (chunkInfo) => {
          // Background, content, and inject scripts go to root
          if (['background', 'content', 'inject'].includes(chunkInfo.name)) {
            return '[name].js';
          }
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        // Make content and inject scripts self-contained (no imports)
        manualChunks(id) {
          // Don't split content or inject scripts - they need to be self-contained
          if (id.includes('content/index.ts') || id.includes('content/inject.ts') || id.includes('content/ecash-scanner.ts')) {
            return undefined;
          }
          // Put shared dependencies in a client chunk for React pages
          if (id.includes('node_modules')) {
            return 'client';
          }
        },
      },
    },
    sourcemap: process.env.NODE_ENV === 'development',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,
        pure_funcs: ['console.log', 'console.debug'],
      },
    },
    target: 'esnext',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
  },
});
