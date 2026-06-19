import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Vitest solo corre los tests TS del dominio (tests/cobros). Los suites legacy
// en .mjs (v1, public-booking, agents) siguen corriendo con node:test vía sus
// propios run-all.sh, para no migrarlos todos de golpe.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
})
