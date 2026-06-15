// BaW OS — GET/POST /api/me/view-mode
// Lee y persiste la preferencia Human/Agent en una cookie. Es una preferencia de
// PRESENTACIÓN (qué layout ve el usuario), no un límite de seguridad: el acceso a
// datos sigue protegido por RLS y el contexto de org aguas abajo. Por eso NO se
// exige sesión aquí — exigirla rompía el toggle para platform admins sin usuario
// estándar de Supabase Auth (getUser() → null → 401 → la cookie nunca se guardaba).

import { NextRequest, NextResponse } from 'next/server'
import { getViewMode, setViewMode, type ViewMode } from '@/lib/agents/view-mode'

export async function GET() {
  const mode = await getViewMode()
  return NextResponse.json({ success: true, data: { mode } })
}

export async function POST(req: NextRequest) {
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
