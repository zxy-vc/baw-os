import Image from 'next/image'
import MonoLabel from './MonoLabel'

// PLACEHOLDERS: arquitectónicos minimalistas. Reemplazar al recibir shoot WS-4.
const DEFAULT_IMAGES = [
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?w=1200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1600&auto=format&fit=crop&q=80',
]

export default function BuildingGallery({
  images = DEFAULT_IMAGES,
  buildingName = 'el edificio',
  title = 'Una construcción restaurada de los años setenta, ahora vivienda corta.',
  body = 'Doce departamentos distribuidos en tres niveles, con planta baja comercial. Restauración cuidadosa del concreto original, carpintería en madera natural y paleta neutra. Lobby con acceso biométrico, patio interior y estacionamiento subterráneo.',
}: {
  images?: string[]
  buildingName?: string
  title?: string
  body?: string | null
}) {
  const [a, b, c, d] = [
    images[0] ?? DEFAULT_IMAGES[0],
    images[1] ?? DEFAULT_IMAGES[1],
    images[2] ?? DEFAULT_IMAGES[2],
    images[3] ?? DEFAULT_IMAGES[3],
  ]
  return (
    <section id="edificio" style={{ paddingTop: 64, paddingBottom: 64 }}>
      <div className="pb-container">
        <div className="pb-bg-layout">
          {/* Text column */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <MonoLabel as="div" style={{ marginBottom: 16 }}>El edificio</MonoLabel>
            <h2 style={{ fontSize: 'clamp(36px, 5vw, 56px)', letterSpacing: '-0.025em', marginBottom: 24, lineHeight: 1.05 }}>
              {title}
            </h2>
            {body && (
              <p style={{ fontSize: 17, lineHeight: 1.65, color: 'var(--ink-2)', maxWidth: 520 }}>
                {body}
              </p>
            )}
          </div>

          {/* Grid asimétrico */}
          <div className="pb-bg-grid">
            <div className="pb-bg-a" style={{ borderRadius: 'var(--r-4)', overflow: 'hidden', position: 'relative', background: 'var(--bg-2)' }}>
              <Image src={a} alt={`Fachada de ${buildingName}`} fill sizes="(max-width: 900px) 100vw, 50vw" style={{ objectFit: 'cover' }} loading="lazy" unoptimized />
            </div>
            <div className="pb-bg-b" style={{ borderRadius: 'var(--r-4)', overflow: 'hidden', position: 'relative', background: 'var(--bg-2)' }}>
              <Image src={b} alt="Patio interior" fill sizes="(max-width: 900px) 50vw, 25vw" style={{ objectFit: 'cover' }} loading="lazy" unoptimized />
            </div>
            <div className="pb-bg-c" style={{ borderRadius: 'var(--r-4)', overflow: 'hidden', position: 'relative', background: 'var(--bg-2)' }}>
              <Image src={c} alt="Lobby" fill sizes="(max-width: 900px) 50vw, 25vw" style={{ objectFit: 'cover' }} loading="lazy" unoptimized />
            </div>
            <div className="pb-bg-d" style={{ borderRadius: 'var(--r-4)', overflow: 'hidden', position: 'relative', background: 'var(--bg-2)' }}>
              <Image src={d} alt="Interior tipo de una unidad" fill sizes="(max-width: 900px) 100vw, 50vw" style={{ objectFit: 'cover' }} loading="lazy" unoptimized />
            </div>
          </div>
        </div>

        <style>{`
          .pb-bg-layout {
            display: grid;
            gap: 40px;
            grid-template-columns: 1fr;
          }
          .pb-bg-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-template-rows: 220px 180px;
            gap: 12px;
          }
          .pb-bg-a { grid-column: 1 / 3; grid-row: 1; }
          .pb-bg-b { grid-column: 1; grid-row: 2; }
          .pb-bg-c { grid-column: 2; grid-row: 2; }
          .pb-bg-d { display: none; }

          @media (min-width: 900px) {
            .pb-bg-layout {
              grid-template-columns: 1fr 1fr;
              gap: 64px;
            }
            .pb-bg-grid {
              grid-template-columns: 2fr 1fr;
              grid-template-rows: 280px 280px;
              gap: 16px;
            }
            .pb-bg-a { grid-column: 1; grid-row: 1; }
            .pb-bg-b { grid-column: 2; grid-row: 1; }
            .pb-bg-c { grid-column: 1; grid-row: 2; }
            .pb-bg-d { display: block; grid-column: 2; grid-row: 2; }
          }
        `}</style>
      </div>
    </section>
  )
}
