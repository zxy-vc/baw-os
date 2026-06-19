// BaW OS — Regresión: folio y referencia ordenados (candado del bug PR #95).
//
// Importa el código real: folioFor() de src/lib/estado-cuenta.ts y referenceFor()
// de src/lib/cobros.ts. Antes el folio usaba un fragmento de UUID (se veía
// aleatorio) y la referencia quedaba vacía; ahora ambos se derivan, deterministas,
// de depto + periodo.

import { describe, it, expect } from 'vitest'
import { folioFor } from '@/lib/estado-cuenta'
import { referenceFor } from '@/lib/cobros'

describe('folioFor', () => {
  it('formato legible EC-{depto}-{periodo}', () => {
    expect(folioFor('D102', '2026-02')).toBe('EC-D102-2026-02')
  })

  it('es determinista: mismo depto + mes => mismo folio', () => {
    expect(folioFor('D102', '2026-02')).toBe(folioFor('D102', '2026-02'))
  })

  it('INVARIANTE: sin rastros aleatorios de UUID (bug #95)', () => {
    expect(folioFor('D102', '2026-02')).toMatch(/^EC-[A-Za-z0-9]+-\d{4}-\d{2}$/)
  })

  it('fallback defensivo cuando falta el depto', () => {
    expect(folioFor(null, '2026-02')).toBe('EC-SN-2026-02')
  })
})

describe('referenceFor', () => {
  it('formato {depto}-{periodo}', () => {
    expect(referenceFor('D102', '2026-02')).toBe('D102-2026-02')
  })

  it('fallback a SN cuando el depto viene vacío', () => {
    expect(referenceFor('  ', '2026-02')).toBe('SN-2026-02')
  })
})
