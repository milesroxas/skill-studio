import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ['src/{domain,judges,application,infrastructure,interfaces,renderer}/**/*.test.ts'],
    environment: 'node',
    // `pnpm test:coverage` writes coverage/coverage-final.json, which `fallow health` reads
    // for each function's real coverage instead of estimating it.
    coverage: {
      provider: 'v8',
      reporter: ['json'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.ts', 'src/**/__fixtures__/**'],
    },
  },
})
