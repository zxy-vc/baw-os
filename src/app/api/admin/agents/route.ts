// BaW OS — Admin (L0): catálogo de agentes
// GET /api/admin/agents — lista TODOS los agentes (catálogo completo)
//
// Solo Platform Admin (L0). La edición del catálogo es global/compartida entre
// tenants, por eso no es una capacidad de tenant admin.

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { isPlatformAdmin } from '@/lib/platform-admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!(await isPlatformAdmin())) {
    return NextResponse.json(
      { success: false, error: 'Platform admin required' },
      { status: 403 }
    )
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('agents')
    .select(
      'id, display_name, full_name, family, domain, description, role_label, capability_level, feedback_level, status, is_connectable, is_shared_zxy, updated_at'
    )
    .order('family')
    .order('display_name')

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data: data || [] })
}
