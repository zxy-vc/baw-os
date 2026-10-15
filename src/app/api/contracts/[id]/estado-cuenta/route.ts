// BaW OS — GET /api/contracts/[id]/estado-cuenta?periodo=YYYY-MM
// Genera el estado de cuenta del contrato como PDF (react-pdf). Requiere sesión
// de un miembro de la org; el motor filtra el contrato por esa org (BAW-2:
// antes la API key global usaba service client sin org → cualquier contrato).
import { NextRequest, NextResponse } from 'next/server'
import React from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { createServiceClient } from '@/lib/api-auth'
import { requireMemberCaller } from '@/lib/admin-auth'
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
  const auth = await requireMemberCaller()
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })
  const supabase = createServiceClient()

  const periodoParam = request.nextUrl.searchParams.get('periodo') || currentPeriodo()
  if (!/^\d{4}-\d{2}$/.test(periodoParam)) {
    return NextResponse.json({ error: 'periodo inválido (use YYYY-MM)' }, { status: 400 })
  }

  const doc = await getEstadoCuentaData(supabase, params.id, periodoParam, auth.orgId)
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
