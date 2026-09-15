import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    globals: true,
    projects: [
      {
        // Le domaine et les cas d'usage se testent sans DOM ni mock.
        extends: true,
        test: {
          name: 'domain',
          environment: 'node',
          include: ['src/{domain,application,infrastructure,lib}/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
          include: ['src/{components,app}/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
});
