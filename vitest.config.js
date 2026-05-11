import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['electron/**/*.test.js', 'client/src/**/*.test.js', 'server/**/*.test.js'],
    globals: false
  }
})
