import type { Metadata } from 'next'
import ConfirmacionClient from './ConfirmacionClient'

export const metadata: Metadata = {
  title: 'Reserva confirmada',
  description: 'Gracias por tu reserva.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default function ConfirmacionPage({
  params,
  searchParams,
}: {
  params: { buildingSlug: string; holdId: string }
  searchParams?: { session_id?: string }
}) {
  return (
    <ConfirmacionClient
      holdId={params.holdId}
      buildingSlug={params.buildingSlug}
      sessionId={searchParams?.session_id}
    />
  )
}
