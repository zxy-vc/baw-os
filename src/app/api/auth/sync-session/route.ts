import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const { access_token, refresh_token } = await request.json().catch(() => ({}))

  if (!access_token || !refresh_token) {
    return NextResponse.json({ error: 'Missing session tokens' }, { status: 400 })
  }

  const supabase = createSupabaseServer()
  const { data, error } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }

  return NextResponse.json({ email: data.user?.email ?? null })
}
