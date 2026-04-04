// BaW OS — Tenant portal: mis facturas
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

function createPortalClient() {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const supabase = createPortalClient()

  // Buscar contrato por portal_token
  const { data: contract, error } = await supabase
    .from('contracts')
    .select('id')
    .eq('portal_token', params.token)
    .eq('portal_enabled', true)
    .single()

  if (error || !contract) {
    return NextResponse.json({ error: 'Portal no disponible' }, { status: 404 })
  }

  // Buscar facturas del contrato
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, folio_number, total, status, created_at, facturapi_id')
    .eq('contract_id', contract.id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ invoices: invoices || [] })
}
