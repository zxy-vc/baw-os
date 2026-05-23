import type { Metadata } from 'next'
import ConfirmacionClient from './ConfirmacionClient'

export const metadata: Metadata = {
  title: 'Reserva confirmada · Mateos 809',
  description: 'Gracias por reservar en Mateos 809.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default function ConfirmacionPage({
  params,
  searchParams,
}: {
  params: { holdId: string }
  searchParams?: { session_id?: string }
}) {
  return (
    <ConfirmacionClient
      holdId={params.holdId}
      sessionId={searchParams?.session_id}
    />
  )
}
