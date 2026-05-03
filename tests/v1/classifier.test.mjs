// BaW OS — Tests del classifier (Fase 4)
// Pure-logic: replicamos la matriz canónica autonomy_level × per_action × default
// para verificar la tabla de decisiones del classifier sin DB. Cuando se integre
// vitest, este test debería re-importar resolveActionClassification con DB stub.
//
// Run: node tests/v1/classifier.test.mjs

const DEFAULTS = {
  'unit.read': 'LOG',
  'reservation.read': 'LOG',
  'payment.read': 'LOG',
  'incident.create': 'AUTO',
  'incident.update_status': 'AUTO',
  'task.create': 'AUTO',
  'reservation.create': 'REQUIRE_APPROVAL',
  'payment.charge': 'REQUIRE_APPROVAL',
  'cfdi.emit': 'REQUIRE_APPROVAL',
  'message.send_to_tenant': 'REQUIRE_APPROVAL',
  'message.send_internal': 'LOG',
  'agent.run': 'LOG',
  'policy.modify': 'REQUIRE_APPROVAL',
  'contract.sign': 'REQUIRE_APPROVAL',
  'contract.terminate': 'REQUIRE_APPROVAL',
}

const IRREVERSIBLE = new Set([
  'payment.charge',
  'payment.refund',
  'cfdi.emit',
  'contract.sign',
  'contract.terminate',
  'policy.modify',
])

function resolveLocal({ actionType, autonomy, perAction = {}, active = true }) {
  const baseDefault = DEFAULTS[actionType] ?? 'REQUIRE_APPROVAL'

  if (!active) {
    return baseDefault === 'LOG' ? 'LOG' : 'REQUIRE_APPROVAL'
  }
  if (autonomy === 0) return 'DISABLED'

  if (perAction[actionType]) {
    const override = perAction[actionType]
    if (IRREVERSIBLE.has(actionType) && override !== 'REQUIRE_APPROVAL') {
      return 'REQUIRE_APPROVAL'
    }
    return override
  }

  const isRead = baseDefault === 'LOG' && actionType.endsWith('.read')
  if (autonomy === 1 && !isRead && baseDefault === 'AUTO') {
    return 'REQUIRE_APPROVAL'
  }
  if (autonomy === 4 && baseDefault === 'REQUIRE_APPROVAL') {
    if (IRREVERSIBLE.has(actionType)) return 'REQUIRE_APPROVAL'
    return 'AUTO'
  }
  return baseDefault
}

const CASES = [
  { name: 'L0 disables everything', actionType: 'incident.create', autonomy: 0, expected: 'DISABLED' },
  { name: 'L0 even disables reads', actionType: 'unit.read', autonomy: 0, expected: 'DISABLED' },
  { name: 'L1 elevates AUTO write to APPROVAL', actionType: 'incident.create', autonomy: 1, expected: 'REQUIRE_APPROVAL' },
  { name: 'L1 keeps reads as LOG', actionType: 'unit.read', autonomy: 1, expected: 'LOG' },
  { name: 'L2 respects default AUTO', actionType: 'incident.create', autonomy: 2, expected: 'AUTO' },
  { name: 'L2 respects default APPROVAL', actionType: 'reservation.create', autonomy: 2, expected: 'REQUIRE_APPROVAL' },
  { name: 'L4 elevates APPROVAL to AUTO for non-irreversible', actionType: 'reservation.create', autonomy: 4, expected: 'AUTO' },
  { name: 'L4 keeps payment.charge as APPROVAL (irreversible)', actionType: 'payment.charge', autonomy: 4, expected: 'REQUIRE_APPROVAL' },
  { name: 'L4 keeps cfdi.emit locked', actionType: 'cfdi.emit', autonomy: 4, expected: 'REQUIRE_APPROVAL' },
  { name: 'L4 keeps contract.sign locked', actionType: 'contract.sign', autonomy: 4, expected: 'REQUIRE_APPROVAL' },
  { name: 'per_action override beats default', actionType: 'incident.create', autonomy: 2, perAction: { 'incident.create': 'LOG' }, expected: 'LOG' },
  { name: 'per_action override on irreversible is rejected', actionType: 'payment.charge', autonomy: 4, perAction: { 'payment.charge': 'AUTO' }, expected: 'REQUIRE_APPROVAL' },
  { name: 'inactive policy forces APPROVAL on writes', actionType: 'incident.create', autonomy: 4, active: false, expected: 'REQUIRE_APPROVAL' },
  { name: 'inactive policy keeps reads as LOG', actionType: 'unit.read', autonomy: 4, active: false, expected: 'LOG' },
]

let pass = 0, fail = 0
for (const c of CASES) {
  const actual = resolveLocal(c)
  if (actual === c.expected) { console.log(`  ✓ ${c.name}`); pass++ }
  else { console.error(`  ✗ ${c.name} — expected ${c.expected}, got ${actual}`); fail++ }
}
console.log(`\nClassifier: ${pass}/${pass + fail} pass`)
if (fail > 0) process.exit(1)
