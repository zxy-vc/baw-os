'use client'

// BaW OS — Store compartido del view mode (Human ↔ Agent) en el cliente.
//
// Problema que resuelve: hay 2+ instancias de <ViewModeSwitch> (sidebar inferior
// + header de Agentes). Antes cada una tenía su propio useState, así que cambiar
// una NO actualizaba la otra (se desincronizaban). Este store es un único origen
// de verdad en el cliente: cualquier instancia que cambie el modo notifica a
// todas las demás vía useSyncExternalStore.
//
// La persistencia real sigue siendo la cookie `baw_view_mode` (vía
// POST /api/me/view-mode); este store solo mantiene la UI sincronizada.

export type ViewMode = 'human' | 'agent'

let mode: ViewMode = 'human'
let initialized = false
const subscribers = new Set<() => void>()

export function getViewModeSnapshot(): ViewMode {
  return mode
}

export function isViewModeInitialized(): boolean {
  return initialized
}

/** Siembra el modo inicial (p.ej. el valor que el servidor ya leyó de la cookie).
 *  Solo aplica la primera vez para no pisar cambios del usuario. */
export function seedViewMode(initial: ViewMode): void {
  if (!initialized) {
    mode = initial
    initialized = true
  }
}

/** Cambia el modo y notifica a TODAS las instancias suscritas (sincronización). */
export function setViewModeLocal(next: ViewMode): void {
  mode = next
  initialized = true
  subscribers.forEach((fn) => fn())
}

export function subscribeViewMode(fn: () => void): () => void {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}
