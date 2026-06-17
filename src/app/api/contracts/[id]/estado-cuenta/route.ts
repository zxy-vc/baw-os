// BaW OS — GET /api/contracts/[id]/estado-cuenta?periodo=YYYY-MM
// Genera el estado de cuenta del contrato como PDF (react-pdf). Requiere sesión
// (humano) o API key legacy (agentes). Filtra por org del contrato vía RLS +
// filtro explícito en el motor.
import { NextRequest, NextResponse } from 'next/server'
import React from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { validateApiKey, createServiceClient } from '@/lib/api-auth'
import { createSupabaseServer } from '@/lib/supabase-server'
import { getEstadoCuentaData } from '@/lib/estado-cuenta'
import { EstadoCuentaPDF } from '@/lib/pdf/EstadoCuentaPDF'

export const dynamic = 'force-dynamic'

function currentPeriodo(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  // Auth: API key (agente) usa service client; humano usa session client (RLS).
  const usingApiKey = validateApiKey(request)
  const supabase = usingApiKey ? createServiceClient() : createSupabaseServer()
  if (!usingApiKey) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const periodoParam = request.nextUrl.searchParams.get('periodo') || currentPeriodo()
  if (!/^\d{4}-\d{2}$/.test(periodoParam)) {
    return NextResponse.json({ error: 'periodo inválido (use YYYY-MM)' }, { status: 400 })
  }

  const doc = await getEstadoCuentaData(supabase, params.id, periodoParam)
  if (!doc) return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 })

  const element = React.createElement(EstadoCuentaPDF, { doc }) as React.ReactElement<DocumentProps>
  const buffer = await renderToBuffer(element)

  const download = request.nextUrl.searchParams.get('download') === '1'
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${doc.folio}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
