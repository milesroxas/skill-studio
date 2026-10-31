import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ['{core,judges,server,cli}/**/*.test.ts'],
    environment: 'node',
  },
})
