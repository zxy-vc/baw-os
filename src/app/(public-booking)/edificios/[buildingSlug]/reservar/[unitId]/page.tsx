import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicUnit } from '@/lib/public-booking/server-data'
import BookingWizard from '@/components/public-booking/BookingWizard'
import MonoLabel from '@/components/public-booking/MonoLabel'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Reservar',
  description: 'Completa tu reserva de departamento amueblado.',
  robots: { index: false, follow: false },
}

export default async function ReservarPage({
  params,
  searchParams,
}: {
  params: { buildingSlug: string; unitId: string }
  searchParams?: { from?: string; to?: string; guests?: string }
}) {
  const unit = await getPublicUnit(params.unitId)
  if (!unit || unit.building_slug !== params.buildingSlug) notFound()
  // Solo estancia corta se reserva en línea; MTR/LTR van por el lead form.
  if (unit.rent_type && unit.rent_type !== 'STR') notFound()

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
          <a
            className="pb-btn pb-btn-primary"
            href={`/edificios/${params.buildingSlug}/unidades/${unit.slug}`}
          >
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
