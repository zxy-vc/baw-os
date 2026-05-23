/**
 * Sprint 5B / WS-2 — Idempotency-Key persistente en sessionStorage.
 *
 * Cada checkout debe enviar un Idempotency-Key estable durante la sesión del
 * usuario para que reintentos no creen dos holds. Se borra explícitamente al
 * llegar a la pantalla de confirmación.
 */

import { v4 as uuidv4 } from 'uuid'

const PREFIX = 'baw:booking:idem:'

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof sessionStorage !== 'undefined'
}

export function getOrCreateIdempotencyKey(scope: string): string {
  if (!isBrowser()) return uuidv4()
  const key = PREFIX + scope
  let v = sessionStorage.getItem(key)
  if (!v) {
    v = uuidv4()
    sessionStorage.setItem(key, v)
  }
  return v
}

export function clearIdempotencyKey(scope: string): void {
  if (!isBrowser()) return
  sessionStorage.removeItem(PREFIX + scope)
}

export function clearAllIdempotencyKeys(): void {
  if (!isBrowser()) return
  const toDelete: string[] = []
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i)
    if (k && k.startsWith(PREFIX)) toDelete.push(k)
  }
  toDelete.forEach((k) => sessionStorage.removeItem(k))
}
