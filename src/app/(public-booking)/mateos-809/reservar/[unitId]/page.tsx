import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getUnit } from '@/lib/public-booking-client/api-client'
import BookingWizard from '@/components/public-booking/BookingWizard'
import MonoLabel from '@/components/public-booking/MonoLabel'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Reservar · Mateos 809',
  description: 'Completa tu reserva de departamento amueblado en Mateos 809, León.',
  robots: { index: false, follow: false },
}

export default async function ReservarPage({
  params,
  searchParams,
}: {
  params: { unitId: string }
  searchParams?: { from?: string; to?: string; guests?: string }
}) {
  const res = await getUnit(params.unitId)
  if (res.error || !res.data) notFound()

  const unit = res.data
  const from = searchParams?.from
  const to = searchParams?.to
  const guests = searchParams?.guests ? Number(searchParams.guests) : 2

  if (!from || !to) {
    // Si llegan sin fechas, mandamos de regreso al detalle.
    return (
      <section style={{ paddingTop: 64, paddingBottom: 96 }}>
        <div className="pb-container">
          <h1 style={{ fontSize: 32, marginBottom: 16 }}>
            Faltan fechas para continuar
          </h1>
          <p style={{ color: 'var(--ink-2)', marginBottom: 24 }}>
            Vuelve al detalle de la unidad y selecciona check-in y check-out.
          </p>
          <a className="pb-btn pb-btn-primary" href={`/mateos-809/unidades/${unit.slug}`}>
            Ver unidad
          </a>
        </div>
      </section>
    )
  }

  return (
    <section style={{ paddingTop: 32, paddingBottom: 96 }}>
      <div className="pb-container">
        <header style={{ marginBottom: 32, maxWidth: 720 }}>
          <MonoLabel as="div" style={{ marginBottom: 8 }}>
            Reservar · {unit.name ?? unit.slug}
          </MonoLabel>
          <h1 style={{ fontSize: 'clamp(32px, 4vw, 48px)', letterSpacing: '-0.025em', marginBottom: 12 }}>
            Termina tu reserva en tres pasos
          </h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 16, lineHeight: 1.6 }}>
            Confirmas fechas, capturas tus datos y completas el pago. Sin compromiso hasta que confirmes.
          </p>
        </header>

        <div style={{ maxWidth: 720 }}>
          <BookingWizard
            unit={unit}
            initialFrom={from}
            initialTo={to}
            initialGuests={guests}
          />
        </div>
      </div>
    </section>
  )
}
