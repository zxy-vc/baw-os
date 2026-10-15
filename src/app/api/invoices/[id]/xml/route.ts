// BaW OS — Download invoice XML
// BAW-2: solo sesión de un miembro de la org activa; la factura se busca
// acotada a auth.orgId (antes API key global → descarga cross-tenant).
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/api-auth'
import { requireMemberCaller } from '@/lib/admin-auth'
import { downloadInvoice } from '@/lib/facturapi'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireMemberCaller()
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status })
  }
  const supabase = createServiceClient()

  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('facturapi_id')
    .eq('id', params.id)
    .eq('org_id', auth.orgId)
    .single()

  if (error || !invoice) {
    return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
  }

  if (!invoice.facturapi_id || invoice.facturapi_id.startsWith('mock_')) {
    return NextResponse.json(
      { error: 'No disponible en modo prueba' },
      { status: 404 }
    )
  }

  const res = await downloadInvoice(invoice.facturapi_id, 'xml')
  if (!res) {
    return NextResponse.json({ error: 'Error descargando XML' }, { status: 502 })
  }

  const body = await res.arrayBuffer()
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/xml',
      'Content-Disposition': `attachment; filename="factura-${params.id}.xml"`,
    },
  })
}
