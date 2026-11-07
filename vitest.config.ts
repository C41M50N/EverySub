import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config.ts';

// Two kinds of tests, told apart by filename. See docs/testing.md.
//
// - unit: pure logic, no I/O. `*.test.ts` and `*.test.tsx`.
// - db: server functions and jobs against a real Postgres. `*.db.test.ts`.
//   Files run one at a time because each test starts from an empty database
//   and the jobs under test process every user.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: 'unit',
            include: ['src/**/*.test.{ts,tsx}'],
            exclude: [...configDefaults.exclude, 'src/**/*.db.test.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'db',
            include: ['src/**/*.db.test.ts'],
            globalSetup: ['src/test/db-global-setup.ts'],
            setupFiles: ['src/test/db-setup.ts'],
            fileParallelism: false,
          },
        },
      ],
    },
  }),
);
