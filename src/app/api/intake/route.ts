// BaW OS — Intake público: lectura y envío de aplicación por token
import { NextRequest } from 'next/server'
import { createServiceClient, apiError, apiOk } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) return apiError('Token requerido', 400)

  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('tenant_applications')
      .select('id, status, titulares, avales, contract_data, docs, contract_type, unit_id, empresa, tercero_pagador')
      .eq('token', token)
      .single()

    if (error || !data) return apiError('Aplicación no encontrada', 404)
    if (data.status !== 'draft') return apiError('Esta aplicación ya fue enviada', 400)

    return apiOk(data)
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Error interno', 500)
  }
}

export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) return apiError('Token requerido', 400)

  try {
    const supabase = createServiceClient()
    const body = await request.json()

    // Verificar que la aplicación existe y está en draft
    const { data: existing, error: fetchError } = await supabase
      .from('tenant_applications')
      .select('id, status')
      .eq('token', token)
      .single()

    if (fetchError || !existing) return apiError('Aplicación no encontrada', 404)
    if (existing.status !== 'draft') return apiError('Esta aplicación ya fue enviada', 400)

    // Construir payload de actualización
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (body.titulares !== undefined) updates.titulares = body.titulares
    if (body.avales !== undefined) updates.avales = body.avales
    if (body.contract_data !== undefined) updates.contract_data = body.contract_data
    if (body.docs !== undefined) updates.docs = body.docs

    // Si submit=true → marcar como enviada
    if (body.submit === true) {
      updates.status = 'submitted'
      updates.submitted_at = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('tenant_applications')
      .update(updates)
      .eq('token', token)
      .select()
      .single()

    if (error) return apiError(error.message, 500)
    return apiOk(data)
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Error interno', 500)
  }
}
