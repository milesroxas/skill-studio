import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ['src/{domain,judges,application,infrastructure,interfaces}/**/*.test.ts'],
    environment: 'node',
  },
})
