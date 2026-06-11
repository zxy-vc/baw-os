// BaW OS — Pre-build guard: verifica que el submodule design/baw-design esté
// inicializado antes de compilar. Sin esto, un submodule faltante muere con un
// error CSS críptico en `@import "../../design/baw-design/tokens/index.css"`.
// Corre automáticamente vía `prebuild` en package.json (local y Vercel).

import { statSync } from 'node:fs'
import { resolve } from 'node:path'

const tokensPath = resolve(process.cwd(), 'design/baw-design/tokens/index.css')

let ok = false
try {
  ok = statSync(tokensPath).size > 0
} catch {
  ok = false
}

if (!ok) {
  console.error('')
  console.error('✗ design/baw-design/tokens/index.css no existe o está vacío.')
  console.error('')
  console.error('  El submodule `design/baw-design` no está inicializado. Corre:')
  console.error('')
  console.error('    git submodule update --init --recursive')
  console.error('')
  console.error('  En Vercel: verifica que el deploy tenga acceso al repo')
  console.error('  zxy-vc/baw-design y que installCommand incluya el submodule init.')
  console.error('')
  process.exit(1)
}

console.log('✓ design tokens OK (submodule baw-design inicializado)')
