// BaW OS — POST /api/payments/[id]/receipt
// Envía el comprobante de pago por WhatsApp. Lo llama el flujo manual de /cobros
// tras registrar un pago. Requiere sesión (humano) o API key legacy.
import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/api-auth'
import { createSupabaseServer } from '@/lib/supabase-server'
import { sendPaymentReceipt } from '@/lib/payment-receipt'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!validateApiKey(request)) {
    const supabase = createSupabaseServer()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await sendPaymentReceipt(params.id)
  return NextResponse.json({ success: result.ok, reason: result.reason })
}
