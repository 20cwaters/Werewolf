import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Tests import the game engine straight from source so `npm test` works
// without a build step.
export default defineConfig({
  resolve: {
    alias: {
      '@onuw/shared': path.resolve(process.cwd(), 'shared/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
