import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, getOrgId } from '@/lib/api-auth'

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params
  const supabase = createServiceClient()

  // Validate token and get contract
  const { data: contract, error: contractError } = await supabase
    .from('contracts')
    .select('id, unit_id')
    .eq('portal_token', token)
    .eq('portal_enabled', true)
    .single()

  if (contractError || !contract) {
    return NextResponse.json(
      { error: 'Portal no disponible' },
      { status: 404 }
    )
  }

  const body = await request.json()
  const { category, description } = body

  if (!category || !description || description.length < 10) {
    return NextResponse.json(
      { error: 'Categoría y descripción (mín. 10 caracteres) son requeridos' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('incidents')
    .insert({
      org_id: getOrgId(),
      unit_id: contract.unit_id,
      title: category,
      description,
      status: 'open',
      priority: 'medium',
      notes: 'Reportado desde Portal Inquilino',
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json(
      { error: 'Error al crear incidencia' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, id: data.id })
}
