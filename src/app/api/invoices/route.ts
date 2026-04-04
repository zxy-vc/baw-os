// BaW OS — Invoices API: GET list + POST create CFDI
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, validateApiKey, unauthorized, apiError, apiOk } from '@/lib/api-auth'
import { createInvoice, isMockMode } from '@/lib/facturapi'

export async function GET(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()
  const supabase = createServiceClient()
  const url = new URL(request.url)
  const contractId = url.searchParams.get('contract_id')
  const status = url.searchParams.get('status')
  const month = url.searchParams.get('month') // YYYY-MM

  let query = supabase
    .from('invoices')
    .select('*')
    .order('created_at', { ascending: false })

  if (contractId) query = query.eq('contract_id', contractId)
  if (status) query = query.eq('status', status)
  if (month) {
    const [year, mon] = month.split('-').map(Number)
    const start = `${year}-${String(mon).padStart(2, '0')}-01T00:00:00`
    const endMonth = mon === 12 ? 1 : mon + 1
    const endYear = mon === 12 ? year + 1 : year
    const end = `${endYear}-${String(endMonth).padStart(2, '0')}-01T00:00:00`
    query = query.gte('created_at', start).lt('created_at', end)
  }

  const { data, error } = await query
  if (error) return apiError(error.message, 500)
  return apiOk({ invoices: data, mock_mode: isMockMode })
}

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()
  const supabase = createServiceClient()
  const body = await request.json()

  const { payment_id, rfc, legal_name, zip, email, tax_system, payment_form, notes } = body

  if (!payment_id) return apiError('payment_id is required')
  if (!rfc || !legal_name) return apiError('rfc and legal_name are required')

  // Lookup payment
  const { data: payment, error: payErr } = await supabase
    .from('payments')
    .select('*, contract:contracts(*, unit:units(*), occupant:occupants(*))')
    .eq('id', payment_id)
    .single()

  if (payErr || !payment) return apiError('Payment not found', 404)
  if (payment.status !== 'paid') return apiError('Solo se puede facturar un pago con status paid')

  const contract = payment.contract
  if (!contract) return apiError('Contract not found for this payment', 404)

  // Determine CFDI use and tax based on unit type
  const unitType = contract.unit?.type || 'LTR'
  const isLTR = unitType === 'LTR'
  const cfdiUse = isLTR ? 'S01' : 'G03'
  const taxRate = isLTR ? 0 : 0.16
  const subtotal = Number(payment.amount)
  const tax = Math.round(subtotal * taxRate * 100) / 100
  const total = subtotal + tax

  const customerZip = zip || contract.occupant?.cp_fiscal || '37340'
  const customerTaxSystem = tax_system || contract.occupant?.regimen_fiscal || '616'

  // Create invoice via FacturAPI
  let facturapiResult
  try {
    facturapiResult = await createInvoice({
      customer: {
        legal_name,
        tax_id: rfc,
        email: email || contract.occupant?.email_factura || contract.occupant?.email || undefined,
        tax_system: customerTaxSystem,
        address: { zip: customerZip },
      },
      items: [
        {
          quantity: 1,
          product: {
            description: isLTR
              ? `Renta mensual — Unidad ${contract.unit?.number || ''}`
              : `Hospedaje — Unidad ${contract.unit?.number || ''}`,
            product_key: '80131500',
            unit_key: 'E48',
            price: subtotal,
            tax_included: false,
          },
        },
      ],
      use: cfdiUse,
      payment_form: payment_form || '03',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'FacturAPI error'
    return apiError(message, 502)
  }

  // Save to DB
  const invoiceStatus = facturapiResult._mock ? 'draft' : 'valid'
  const { data: invoice, error: insErr } = await supabase
    .from('invoices')
    .insert({
      org_id: 'baw',
      payment_id,
      contract_id: contract.id,
      facturapi_id: facturapiResult.id,
      folio_number: facturapiResult.folio_number,
      status: invoiceStatus,
      cfdi_use: cfdiUse,
      tax_regime: customerTaxSystem,
      subtotal,
      tax,
      total,
      customer_rfc: rfc,
      customer_name: legal_name,
      customer_email: email || null,
      notes: notes || null,
      created_by: 'system',
    })
    .select()
    .single()

  if (insErr) return apiError(insErr.message, 500)

  return NextResponse.json(
    { success: true, data: { ...invoice, mock_mode: isMockMode } },
    { status: 201 }
  )
}
