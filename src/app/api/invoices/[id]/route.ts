// BaW OS — Invoice detail: GET + DELETE (cancel)
import { NextRequest } from 'next/server'
import { createServiceClient, validateApiKey, unauthorized, apiError, apiOk } from '@/lib/api-auth'
import { cancelInvoice, isMockMode } from '@/lib/facturapi'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!validateApiKey(_request)) return unauthorized()
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !data) return apiError('Invoice not found', 404)

  // Enrich with contract + payment info
  let contract = null
  let payment = null
  if (data.contract_id) {
    const { data: c } = await supabase
      .from('contracts')
      .select('*, unit:units(*), occupant:occupants(*)')
      .eq('id', data.contract_id)
      .single()
    contract = c
  }
  if (data.payment_id) {
    const { data: p } = await supabase
      .from('payments')
      .select('*')
      .eq('id', data.payment_id)
      .single()
    payment = p
  }

  return apiOk({ ...data, contract, payment, mock_mode: isMockMode })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!validateApiKey(_request)) return unauthorized()
  const supabase = createServiceClient()

  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !invoice) return apiError('Invoice not found', 404)
  if (invoice.status === 'cancelled') return apiError('La factura ya está cancelada')

  // Cancel via FacturAPI
  if (invoice.facturapi_id && !invoice.facturapi_id.startsWith('mock_')) {
    try {
      await cancelInvoice(invoice.facturapi_id)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error cancelando factura'
      return apiError(message, 502)
    }
  }

  // Update status in DB
  const { data: updated, error: updErr } = await supabase
    .from('invoices')
    .update({ status: 'cancelled' })
    .eq('id', params.id)
    .select()
    .single()

  if (updErr) return apiError(updErr.message, 500)
  return apiOk(updated)
}
