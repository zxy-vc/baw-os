// BaW OS — GET /api/agents · listado catálogo
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('agents')
    .select('id, display_name, full_name, family, domain, description, capability_level, feedback_level, status, is_shared_zxy')
    .order('family', { ascending: true })
    .order('display_name', { ascending: true })

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, data: data || [] })
}
