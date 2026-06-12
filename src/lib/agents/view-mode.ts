// BaW OS — View Mode helper (Human ↔ Agent)
// Persiste la preferencia en una cookie (`baw_view_mode`), no en la DB. Antes
// se guardaba en org_members.preferred_view_mode, pero un platform admin sin
// fila de org_members no persistía nada: la página re-renderizaba en 'human'
// mientras el botón se quedaba en 'agent' (el toggle "no hacía nada"). La
// cookie funciona para cualquier usuario y sobrevive a router.refresh().

import { cookies } from 'next/headers'

export type ViewMode = 'human' | 'agent'
export const DEFAULT_VIEW_MODE: ViewMode = 'human'
export const VIEW_MODE_COOKIE = 'baw_view_mode'

export async function getViewMode(): Promise<ViewMode> {
  try {
    const value = cookies().get(VIEW_MODE_COOKIE)?.value
    return value === 'agent' ? 'agent' : 'human'
  } catch {
    return DEFAULT_VIEW_MODE
  }
}

export async function setViewMode(mode: ViewMode): Promise<{ ok: boolean; error?: string }> {
  try {
    cookies().set(VIEW_MODE_COOKIE, mode, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 año
      sameSite: 'lax',
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' }
  }
}
