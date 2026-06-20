import type { Session } from '@supabase/supabase-js'

// Empuja la sesión viva del navegador a la cookie del servidor (vía el endpoint
// /api/auth/sync-session). Así los guardias server-side (/me, /admin) y los
// endpoints que leen la cookie (PDF del estado de cuenta) ven SIEMPRE la misma
// sesión que el SPA, en vez de una copia que se quedó vieja por la rotación del
// refresh-token. Esa desincronización es la raíz del loop de login y del
// Unauthorized del PDF.
export async function pushSessionToServer(session: Session | null): Promise<boolean> {
  if (!session?.access_token || !session?.refresh_token) return false
  try {
    const res = await fetch('/api/auth/sync-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}
