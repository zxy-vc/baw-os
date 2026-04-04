// BaW OS — Upload de documentos para intake de inquilinos
import { NextRequest } from 'next/server'
import { createServiceClient, apiError, apiOk } from '@/lib/api-auth'

const VALID_DOC_TYPES = ['ine_front', 'ine_back', 'income_proof', 'domicilio_proof', 'aval_ine', 'aval_domicilio_proof'] as const

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const docType = formData.get('docType') as string | null
    const token = formData.get('token') as string | null

    if (!file) return apiError('Archivo requerido', 400)
    if (!docType || !VALID_DOC_TYPES.includes(docType as typeof VALID_DOC_TYPES[number])) {
      return apiError('Tipo de documento inválido', 400)
    }
    if (!token) return apiError('Token requerido', 400)

    const supabase = createServiceClient()

    // Verificar que la aplicación existe
    const { data: app, error: appError } = await supabase
      .from('tenant_applications')
      .select('id, status')
      .eq('token', token)
      .single()

    if (appError || !app) return apiError('Aplicación no encontrada', 404)
    if (app.status !== 'draft') return apiError('Esta aplicación ya fue enviada', 400)

    // Subir archivo a Supabase Storage
    const ext = file.name.split('.').pop() || 'pdf'
    const filePath = `${app.id}/${docType}.${ext}`
    const arrayBuffer = await file.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)

    const { error: uploadError } = await supabase.storage
      .from('tenant-docs')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) return apiError(`Error al subir archivo: ${uploadError.message}`, 500)

    // Obtener URL pública
    const { data: urlData } = supabase.storage
      .from('tenant-docs')
      .getPublicUrl(filePath)

    // Actualizar docs en la aplicación
    const { error: updateError } = await supabase
      .from('tenant_applications')
      .update({
        docs: { ...((await supabase.from('tenant_applications').select('docs').eq('id', app.id).single()).data?.docs || {}), [docType]: urlData.publicUrl },
        updated_at: new Date().toISOString(),
      })
      .eq('id', app.id)

    if (updateError) return apiError(updateError.message, 500)

    return apiOk({ url: urlData.publicUrl, docType })
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Error interno', 500)
  }
}
