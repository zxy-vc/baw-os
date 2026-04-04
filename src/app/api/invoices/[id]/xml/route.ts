// BaW OS — Download invoice XML
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/api-auth'
import { downloadInvoice } from '@/lib/facturapi'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient()

  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('facturapi_id')
    .eq('id', params.id)
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
