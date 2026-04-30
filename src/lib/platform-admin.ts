// BaW OS — Platform Admin (L0) Guard (Sprint 4 / S4-1.5)
//
// Las 3 capas de admin:
//   L0 Platform   → /admin, solo ZXY humanos (fran@zxy.vc)
//   L1 Tenant     → /settings/account, pm_owner | pm_admin por org
//   L2 User       → /me, preferencias del usuario actual
//
// La fuente de verdad es la tabla `platform_admins`. El env var
// `PLATFORM_ADMIN_EMAILS` actúa como bootstrap fallback antes de que la
// migración corra.

import { createSupabaseServer } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/api-auth'

function bootstrapEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS || 'fran@zxy.vc')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * ¿Es el usuario logueado un Platform Admin (L0)?
 *
 * Resolución:
 *  1. Sesión válida con email
 *  2. El email aparece en la tabla `platform_admins`, O
 *  3. Bootstrap: el email aparece en `PLATFORM_ADMIN_EMAILS`
 */
export async function isPlatformAdmin(): Promise<boolean> {
  const supabase = createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) return false

  const email = user.email.toLowerCase()

  // Bootstrap fallback (antes de que la migración haya corrido en algún env)
  if (bootstrapEmails().includes(email)) return true

  const service = createServiceClient()
  const { data, error } = await service
    .from('platform_admins')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (error) return false
  return !!data
}

/**
 * Devuelve el email + flag de Platform Admin del usuario actual.
 * Útil para Server Components que renderizan el menú de cuenta.
 */
export async function getPlatformAdminContext(): Promise<{
  email: string | null
  isAdmin: boolean
}> {
  const supabase = createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) return { email: null, isAdmin: false }
  return { email: user.email, isAdmin: await isPlatformAdmin() }
}

/**
 * Lanza si el usuario no es L0. Usar al inicio de Server Components o
 * Route Handlers que requieren acceso de plataforma.
 */
export async function requirePlatformAdmin(): Promise<void> {
  const ok = await isPlatformAdmin()
  if (!ok) {
    throw new Error('FORBIDDEN: Platform admin required')
  }
}
