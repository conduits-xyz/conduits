import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const root = path.resolve(__dirname, 'src');
const app = path.resolve(root, 'app');
const web = path.resolve(root, 'web');
const lib = path.resolve(root, 'lib');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      api: path.resolve(root, 'api'),
      app,
      hooks: path.resolve(root, 'hooks'),
      mocks: path.resolve(root, 'mocks'),
      components: path.resolve(app, 'components'),
      store: path.resolve(root, 'store'),
      web,
      lib,
      kiscss: path.resolve(lib, 'kiscss'),
    },
  },
  build: {
    outDir: 'build',
  },
});
