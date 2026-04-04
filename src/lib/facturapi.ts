// BaW OS — FacturAPI wrapper — usa mock si no hay key configurada

const FACTURAPI_KEY = process.env.FACTURAPI_SECRET_KEY

export const isMockMode = !FACTURAPI_KEY

export interface InvoiceData {
  customer: {
    legal_name: string
    tax_id: string  // RFC
    email?: string
    tax_system: string  // 616 personas físicas, 601 personas morales
    address: {
      zip: string  // CP obligatorio
    }
  }
  items: Array<{
    quantity: number
    product: {
      description: string
      product_key: string  // 80131500 servicios inmobiliarios
      unit_key: string     // E48 servicio
      price: number
      tax_included: boolean
    }
  }>
  use: string  // S01 o G03
  payment_form: string  // 03 transferencia, 01 efectivo, 04 tarjeta
}

export async function createInvoice(data: InvoiceData) {
  if (isMockMode) {
    return {
      id: `mock_${Date.now()}`,
      folio_number: Math.floor(Math.random() * 1000) + 1,
      status: "valid",
      verification_url: "https://verificacfdi.facturaelectronica.sat.gob.mx",
      pdf: null,
      xml: null,
      _mock: true,
    }
  }

  const res = await fetch("https://www.facturapi.io/v2/invoices", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FACTURAPI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.message || "FacturAPI error")
  }

  return res.json()
}

export async function cancelInvoice(invoiceId: string, motive: string = "02") {
  if (isMockMode) return { status: "cancelled", _mock: true }

  const res = await fetch(
    `https://www.facturapi.io/v2/invoices/${invoiceId}/cancel?motive=${motive}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${FACTURAPI_KEY}` },
    }
  )

  return res.json()
}

export async function downloadInvoice(invoiceId: string, format: "pdf" | "xml") {
  if (isMockMode) return null

  const res = await fetch(
    `https://www.facturapi.io/v2/invoices/${invoiceId}/${format}`,
    {
      headers: { Authorization: `Bearer ${FACTURAPI_KEY}` },
    }
  )

  if (!res.ok) return null
  return res
}
