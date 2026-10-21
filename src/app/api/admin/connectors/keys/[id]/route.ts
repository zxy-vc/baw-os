// BaW OS — Admin: revocar una llave del conector v1 (ENG-624)
// DELETE /api/admin/connectors/keys/[id] — status='revoked' (no se borra: la
// bitácora la referencia). Efecto inmediato: la siguiente lectura da 401.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdminCaller } from '@/lib/admin-auth'
import { CONNECTOR_KEY_PUBLIC_COLUMNS } from '@/lib/connectors/keys'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminCaller()
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.message }, { status: auth.status })

  const { data, error } = await createServiceClient()
    .from('connector_keys')
    .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_by: auth.userId })
    .eq('id', params.id)
    .eq('org_id', auth.orgId)
    .eq('status', 'active')
    .select(CONNECTOR_KEY_PUBLIC_COLUMNS)
    .maybeSingle()

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  if (!data) {
    return NextResponse.json({ success: false, error: 'Llave no encontrada o ya revocada' }, { status: 404 })
  }
  return NextResponse.json({ success: true, data })
}
