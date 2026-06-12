// BaW OS — GET/POST /api/me/view-mode
// Lee y persiste la preferencia Human/Agent del usuario activo en su org activa.

import { NextRequest, NextResponse } from 'next/server'
import { getViewMode, setViewMode, type ViewMode } from '@/lib/agents/view-mode'
import { createSupabaseServer } from '@/lib/supabase-server'

export async function GET() {
  const mode = await getViewMode()
  return NextResponse.json({ success: true, data: { mode } })
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    )
  }

  let body: { mode?: ViewMode }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 }
    )
  }
  const mode = body.mode
  if (mode !== 'human' && mode !== 'agent') {
    return NextResponse.json(
      { success: false, error: 'mode must be "human" or "agent"' },
      { status: 400 }
    )
  }
  const result = await setViewMode(mode)
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error || 'Failed to set view mode' },
      { status: 500 }
    )
  }
  return NextResponse.json({ success: true, data: { mode } })
}
