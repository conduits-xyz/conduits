import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const projectRootDir = fileURLToPath(new URL('.', import.meta.url));
const srcRootDir = resolve(projectRootDir, 'src');
const publicDir = resolve(srcRootDir, 'web/assets');

export default defineConfig({
  root: projectRootDir,
  publicDir,
  plugins: [react()],
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.[jt]sx?$/,
    exclude: []
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx'
      }
    }
  },
  resolve: {
    alias: {
      app: resolve(srcRootDir, 'app'),
      components: resolve(srcRootDir, 'app/components'),
      api: resolve(srcRootDir, 'api'),
      lib: resolve(srcRootDir, 'lib'),
      store: resolve(srcRootDir, 'store'),
      hooks: resolve(srcRootDir, 'hooks'),
      mocks: resolve(srcRootDir, 'mocks')
    }
  },
  build: {
    outDir: resolve(projectRootDir, 'dist'),
    emptyOutDir: true
  },
  server: {
    host: '0.0.0.0'
  }
});
