import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Departamentos amueblados con reserva en línea'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Copy por edificio para la tarjeta OG. Fallback: nombre derivado del slug.
const OG_COPY: Record<
  string,
  { mark: string; kicker: string; line1: string; line2: string; footer: string }
> = {
  'mateos-809': {
    mark: '809',
    kicker: 'MATEOS · LEÓN · GTO',
    line1: 'Doce estancias.',
    line2: 'Una dirección.',
    footer: '12 unidades · estancia corta',
  },
}

function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w.match(/^\d/) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

export default async function OpengraphImage({
  params,
}: {
  params: { buildingSlug: string }
}) {
  const slug = params.buildingSlug
  const copy = OG_COPY[slug] ?? {
    mark: titleFromSlug(slug),
    kicker: 'DEPARTAMENTOS AMUEBLADOS',
    line1: titleFromSlug(slug),
    line2: 'Reserva en línea.',
    footer: 'estancias y rentas',
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#F7F4EF',
          padding: '72px',
          color: '#1A1916',
          fontFamily: 'Georgia, serif',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 28 }}>
          <span style={{ fontWeight: 500, letterSpacing: '-0.02em' }}>{copy.mark}</span>
          <span style={{ width: 1, height: 32, background: '#1A1916', opacity: 0.3 }} />
          <span style={{ fontFamily: 'system-ui, sans-serif', fontSize: 14, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 500 }}>
            {copy.kicker}
          </span>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 96, lineHeight: 1, letterSpacing: '-0.03em' }}>
            {copy.line1}
          </div>
          <div style={{ fontSize: 96, lineHeight: 1, letterSpacing: '-0.03em', fontStyle: 'italic', color: '#44423D' }}>
            {copy.line2}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontFamily: 'system-ui, sans-serif',
            fontSize: 16,
            color: '#44423D',
            paddingTop: 24,
            borderTop: '1px solid #E2DDD3',
          }}
        >
          <span>baw.mx/edificios/{slug}</span>
          <span style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            {copy.footer}
          </span>
        </div>
      </div>
    ),
    { ...size }
  )
}
