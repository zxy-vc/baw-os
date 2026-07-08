// BaW OS — Login del portal de conserje (ADR-022 D5)
// POST { slug, pin } → { token, org } si el PIN es correcto para esa org.
import { NextRequest } from 'next/server'
import {
  createServiceClient,
  timingSafeEqualStr,
  apiError,
  apiOk,
  unauthorized,
} from '@/lib/api-auth'
import { resolveConserjePin, signConserjeToken } from '@/lib/conserje-auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  let body: { slug?: string; pin?: string }
  try {
    body = await request.json()
  } catch {
    return apiError('Invalid JSON body')
  }
  const { slug, pin } = body
  if (!slug || !pin) return apiError('slug and pin are required')

  const supabase = createServiceClient()
  const { data: org, error } = await supabase
    .from('organizations')
    .select('id, name, slug, settings')
    .eq('slug', slug)
    .maybeSingle()

  if (error) return apiError(error.message, 500)
  if (!org) return apiError('Organización no encontrada', 404)

  const expected = resolveConserjePin(org.settings)
  if (!timingSafeEqualStr(pin, expected)) {
    // Freno mínimo a fuerza bruta: el PIN es corto por diseño (teclado táctil
    // de recepción), así que encarecemos cada intento fallido.
    await new Promise((r) => setTimeout(r, 750))
    return unauthorized('PIN incorrecto')
  }

  const { token, expiresAt } = signConserjeToken(org.id)
  return apiOk({
    token,
    expires_at: expiresAt,
    org: { id: org.id, name: org.name, slug: org.slug },
  })
}
