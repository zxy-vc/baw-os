// BaW OS — Platform Admin: am I L0? — Sprint 4 / S4-1.5
//
// Endpoint que client components pueden consumir para mostrar/ocultar entradas
// de menú L0 sin recargar la página.

import { NextResponse } from 'next/server'
import { getPlatformAdminContext } from '@/lib/platform-admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { email, isAdmin } = await getPlatformAdminContext()
  return NextResponse.json({ email, isPlatformAdmin: isAdmin })
}
