// BaW OS — Channex Properties endpoint
import { NextResponse } from 'next/server'
import { channexFetch } from '@/lib/channex'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await channexFetch('/properties')
    return NextResponse.json({ success: true, data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { success: false, data: null, error: message },
      { status: 502 }
    )
  }
}
