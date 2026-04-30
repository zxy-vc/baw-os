// BaW OS — User Preferences API — Sprint 4 / S4-1.5

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No session' }, { status: 401 })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('user_preferences')
    .select('locale, timezone, notification_prefs, theme, updated_at')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(
    data ?? {
      locale: 'es',
      timezone: 'America/Mexico_City',
      notification_prefs: { email: true, whatsapp: true, in_app: true },
      theme: 'dark',
    },
  )
}

export async function PUT(request: NextRequest) {
  const supabase = createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No session' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  // Whitelist allowed fields
  const allowed: Record<string, unknown> = {}
  if (typeof body.locale === 'string') allowed.locale = body.locale
  if (typeof body.timezone === 'string') allowed.timezone = body.timezone
  if (typeof body.theme === 'string') allowed.theme = body.theme
  if (body.notification_prefs && typeof body.notification_prefs === 'object') {
    allowed.notification_prefs = body.notification_prefs
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('user_preferences')
    .upsert({ user_id: user.id, ...allowed })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
