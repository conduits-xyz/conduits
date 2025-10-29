import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      app: resolve(__dirname, 'src/app'),
      components: resolve(__dirname, 'src/app/components'),
      api: resolve(__dirname, 'src/api'),
      lib: resolve(__dirname, 'src/lib'),
      store: resolve(__dirname, 'src/store'),
      hooks: resolve(__dirname, 'src/hooks'),
      mocks: resolve(__dirname, 'src/mocks'),
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: [
      './jest/setup.js',
      './src/mocks/test-setup-after.js'
    ],
    globals: true
  }
});
