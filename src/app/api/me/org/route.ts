// BaW OS — API: /api/me/org (Sprint 4 / S4-1)
// Devuelve el org_id activo + rol del usuario logueado.
// Reemplaza el patrón legacy ORG_ID = 'ed4308c7...' hardcoded en client components.

import { NextResponse } from 'next/server'
import { resolveOrgContext, OrgContextError } from '@/lib/org-context'

export async function GET() {
  try {
    const ctx = await resolveOrgContext()
    return NextResponse.json({
      success: true,
      data: {
        org_id: ctx.orgId,
        user_id: ctx.userId,
        role: ctx.role,
      },
    })
  } catch (err) {
    if (err instanceof OrgContextError) {
      const status = err.code === 'NO_SESSION' ? 401 : 403
      return NextResponse.json(
        { success: false, error: err.message, code: err.code },
        { status },
      )
    }
    return NextResponse.json(
      { success: false, error: 'Internal error' },
      { status: 500 },
    )
  }
}
