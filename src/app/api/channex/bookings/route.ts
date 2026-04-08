// BaW OS — Channex Bookings endpoint (last 30 days)
import { NextResponse } from 'next/server'
import { channexFetch } from '@/lib/channex'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const now = new Date()
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const params = new URLSearchParams({
      filter: JSON.stringify({
        date_from: from.toISOString().slice(0, 10),
        date_to: now.toISOString().slice(0, 10),
      }),
    })

    const data = await channexFetch(`/bookings?${params}`)
    return NextResponse.json({ success: true, data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { success: false, data: null, error: message },
      { status: 502 }
    )
  }
}
