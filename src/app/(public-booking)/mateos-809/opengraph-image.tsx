import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Mateos 809 — Doce estancias. Una dirección.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OpengraphImage() {
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
          <span style={{ fontWeight: 500, letterSpacing: '-0.02em' }}>809</span>
          <span style={{ width: 1, height: 32, background: '#1A1916', opacity: 0.3 }} />
          <span style={{ fontFamily: 'system-ui, sans-serif', fontSize: 14, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 500 }}>
            MATEOS · LEÓN · GTO
          </span>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 96, lineHeight: 1, letterSpacing: '-0.03em' }}>
            Doce estancias.
          </div>
          <div style={{ fontSize: 96, lineHeight: 1, letterSpacing: '-0.03em', fontStyle: 'italic', color: '#44423D' }}>
            Una dirección.
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
          <span>baw.mx/mateos-809</span>
          <span style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            12 unidades · estancia corta
          </span>
        </div>
      </div>
    ),
    { ...size }
  )
}
