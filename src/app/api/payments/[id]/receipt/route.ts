// BaW OS — POST /api/payments/[id]/receipt
// Envía el comprobante de pago por WhatsApp. Lo llama el flujo manual de /cobros
// tras registrar un pago. Antes bastaba "hay un usuario" (cualquier rol/tenant)
// y no filtraba el pago por org → IDOR. Ahora exige admin de la org y limita el
// pago a esa org.
import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/api-auth'
import { requireAdminCaller } from '@/lib/admin-auth'
import { sendPaymentReceipt } from '@/lib/payment-receipt'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireAdminCaller()
  let orgId: string | undefined
  if (auth.ok) {
    orgId = auth.orgId
  } else if (!validateApiKey(request)) {
    return NextResponse.json({ error: auth.message }, { status: auth.status })
  }

  const result = await sendPaymentReceipt(params.id, orgId)
  return NextResponse.json({ success: result.ok, reason: result.reason })
}
