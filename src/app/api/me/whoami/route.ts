// BaW OS — /api/me/whoami (Sprint 6 followup #2)
//
// Endpoint MÍNIMO que confirma si la cookie de Supabase está viva en el
// servidor. Lo usa /login después de signIn + sync-session para garantizar
// que la cookie ya fue commiteada antes de navegar a una ruta protegida
// (ej. /admin). Sin esto había race condition: el browser podía hacer
// window.location.href = '/admin' antes de procesar el Set-Cookie del
// sync-session response → server ve getUser()===null → redirect a /login
// → loop infinito.
//
// Distinto de /api/admin/whoami: NO requiere ser platform admin, NO toca
// service-role. Solo lee la cookie del request.

import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createSupabaseServer()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user?.email) {
    return NextResponse.json({ email: null }, { status: 401 })
  }

  return NextResponse.json({
    email: user.email,
    user_id: user.id,
  })
}
