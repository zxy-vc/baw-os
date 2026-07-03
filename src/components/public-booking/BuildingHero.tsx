import Image from 'next/image'
import MonoLabel from './MonoLabel'

/* Regla del punto (brand book §01): si la línea termina en ".", el punto
   final se pinta terracota; si no, se agrega. */
function HeadlineLine({ text }: { text: string }) {
  const base = text.replace(/\.\s*$/, '')
  return (
    <>
      {base}
      <span className="t-dot" aria-hidden="true">.</span>
    </>
  )
}

/* Cifra clave del hero: valor en display ExtraBold + punto terracota,
   etiqueta en cuerpo abajo. */
function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: 32,
          letterSpacing: '-0.04em',
          color: 'var(--ink)',
        }}
      >
        {value}
        <span className="t-dot" aria-hidden="true">.</span>
      </dt>
      <dd style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>
        {label}
      </dd>
    </div>
  )
}

/**
 * Hero del edificio — composición editorial. Lado izquierdo: texto.
 * Lado derecho: imagen aspect 4/5. En móvil: stack vertical.
 *
 * PLACEHOLDERS: las imágenes Unsplash arquitectónicas se sustituyen al
 * recibir el shoot final del edificio (WS-4).
 */
export default function BuildingHero({
  heroUrl,
  unitsCount,
  basePriceMxn,
  buildingName = 'el edificio',
  locationLabel,
  title,
  titleAccent,
  intro,
  priceSuffix = '/noche',
}: {
  heroUrl?: string | null
  unitsCount?: number
  basePriceMxn?: number | null
  buildingName?: string
  locationLabel?: string | null
  /** Primera línea del headline; default: nombre del edificio */
  title?: string
  /** Segunda línea (itálica) del headline */
  titleAccent?: string | null
  intro?: string | null
  priceSuffix?: string
}) {
  // Placeholder: interior arquitectónico minimalista (Unsplash).
  // Reemplazar al recibir fotos reales del shoot.
  const img =
    heroUrl ||
    'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=1600&auto=format&fit=crop&q=80'

  return (
    <section
      style={{
        paddingTop: 64,
        paddingBottom: 64,
      }}
    >
      <div className="pb-container">
        <div className="pb-hero-grid">
          {/* Text column */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {locationLabel && (
              <MonoLabel as="div" style={{ marginBottom: 24 }}>
                {locationLabel}
              </MonoLabel>
            )}

            <h1
              className="t-display"
              style={{
                fontSize: 'clamp(48px, 7vw, 88px)',
                lineHeight: 1.02,
                marginBottom: 24,
              }}
            >
              <HeadlineLine text={title ?? buildingName} />
              {titleAccent && (
                <>
                  <br />
                  <HeadlineLine text={titleAccent} />
                </>
              )}
            </h1>

            {intro && (
              <p
                style={{
                  fontSize: 18,
                  lineHeight: 1.55,
                  color: 'var(--ink-2)',
                  maxWidth: 480,
                  marginBottom: 40,
                }}
              >
                {intro}
              </p>
            )}

            {/* Data grid */}
            <dl
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 24,
                paddingTop: 24,
                borderTop: '1px solid var(--line)',
                maxWidth: 520,
              }}
            >
              {typeof unitsCount === 'number' && unitsCount > 0 && (
                <HeroStat value={String(unitsCount)} label="unidades" />
              )}
              {basePriceMxn != null && basePriceMxn > 0 && (
                <HeroStat
                  value={`$${basePriceMxn.toLocaleString('es-MX')}`}
                  label={priceSuffix === '/noche' ? 'desde, por noche' : `desde ${priceSuffix}`}
                />
              )}
              <HeroStat value="24/7" label="acceso autónomo" />
            </dl>
          </div>

          {/* Image column */}
          <div
            style={{
              position: 'relative',
              aspectRatio: '4 / 5',
              overflow: 'hidden',
              borderRadius: 'var(--r-4)',
              background: 'var(--bg-2)',
            }}
          >
            <Image
              src={img}
              alt={`Interior arquitectónico de ${buildingName}`}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              style={{ objectFit: 'cover' }}
              unoptimized
            />
          </div>
        </div>

        <style>{`
          .pb-hero-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 40px;
          }
          @media (min-width: 1024px) {
            .pb-hero-grid {
              grid-template-columns: 1.1fr 1fr;
              gap: 80px;
              align-items: stretch;
            }
          }
        `}</style>
      </div>
    </section>
  )
}
