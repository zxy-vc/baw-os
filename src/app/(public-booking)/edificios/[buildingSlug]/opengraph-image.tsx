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
    kicker: 'LÓPEZ MATEOS 809 PTE · LEÓN, GTO',
    line1: 'Dieciséis estancias.',
    line2: 'Una dirección.',
    footer: '16 unidades · estancia corta',
  },
}

// Paleta 809 (brand book): hueso / tinta / concreto / terracota
const BONE = '#FAF9F6'
const INK = '#1A1A1A'
const INK2 = '#3A3A38'
const CONCRETE = '#E4E2DC'
const TERRACOTA = '#B0633F'

function DotText({ text, size }: { text: string; size: number }) {
  const base = text.replace(/([.?])\s*$/, '')
  const punct = /([.?])\s*$/.exec(text)?.[1] ?? '.'
  return (
    <div style={{ display: 'flex', fontSize: size, lineHeight: 1, letterSpacing: '-0.04em', fontWeight: 800 }}>
      <span>{base}</span>
      <span style={{ color: TERRACOTA }}>{punct}</span>
    </div>
  )
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
          background: BONE,
          padding: '72px',
          color: INK,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Header — numeral con la regla del punto */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <DotText text={copy.mark} size={36} />
          <span style={{ width: 1, height: 32, background: INK, opacity: 0.25 }} />
          <span style={{ fontSize: 14, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 500, color: INK2 }}>
            {copy.kicker}
          </span>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <DotText text={copy.line1} size={92} />
          <DotText text={copy.line2} size={92} />
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 16,
            color: INK2,
            paddingTop: 24,
            borderTop: `1px solid ${CONCRETE}`,
          }}
        >
          <span>809.mx</span>
          <span style={{ fontSize: 12, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
            {copy.footer}
          </span>
        </div>
      </div>
    ),
    { ...size }
  )
}
