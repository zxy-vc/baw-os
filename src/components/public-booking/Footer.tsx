import Link from 'next/link'
import MonoLabel from './MonoLabel'
import { Logo809Lockup } from './Logo809'

const YEAR = new Date().getFullYear()

/**
 * Footer del sitio público — diseño 809 (Claude Design, julio 2026).
 * Convivencia BaW (brand book §"La marca en casa ajena"): la marca del
 * edificio firma la página; BaW aparece como operador ("operated by BaW"),
 * nunca como marca principal.
 */
export default function Footer({
  buildingSlug,
  buildingName,
  description,
  addressLines,
  contactEmail = 'hola@809.mx',
  whatsappUrl = 'https://wa.me/524771234567',
  instagramUrl = 'https://instagram.com/809.mx',
  tagline,
}: {
  buildingSlug: string
  buildingName: string
  description?: string | null
  addressLines?: string[]
  contactEmail?: string
  whatsappUrl?: string
  instagramUrl?: string
  tagline?: string | null
}) {
  const basePath = `/edificios/${buildingSlug}`
  return (
    <footer
      id="contacto"
      style={{
        background: 'var(--bg-2)',
        borderTop: '1px solid var(--line)',
        marginTop: 96,
        color: 'var(--ink-2)',
      }}
    >
      <div className="pb-container" style={{ paddingTop: 64, paddingBottom: 32 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 48,
          }}
        >
          {/* Brand column */}
          <div>
            <div style={{ color: 'var(--ink)' }}>
              {buildingSlug === 'mateos-809' ? (
                <Logo809Lockup size={48} />
              ) : (
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 800,
                    fontSize: 32,
                    letterSpacing: '-0.04em',
                  }}
                >
                  {buildingName}
                  <span className="t-dot" aria-hidden="true">.</span>
                </span>
              )}
            </div>
            {description && (
              <p style={{ marginTop: 20, fontSize: 14, lineHeight: 1.6, maxWidth: 280 }}>
                {description}
              </p>
            )}
          </div>

          {/* Address */}
          {addressLines && addressLines.length > 0 && (
            <div>
              <MonoLabel as="div" style={{ marginBottom: 14 }}>
                Dirección
              </MonoLabel>
              <address style={{ fontStyle: 'normal', fontSize: 14, lineHeight: 1.7, color: 'var(--ink)' }}>
                {addressLines.map((line, i) => (
                  <span key={i}>
                    {line}
                    {i < addressLines.length - 1 && <br />}
                  </span>
                ))}
              </address>
            </div>
          )}

          {/* Contact */}
          <div>
            <MonoLabel as="div" style={{ marginBottom: 14 }}>
              Contacto
            </MonoLabel>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 14, lineHeight: 1.9 }}>
              <li>
                <a href={`mailto:${contactEmail}`} style={{ color: 'var(--ink)' }}>
                  {contactEmail}
                </a>
              </li>
              <li>
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink)' }}>
                  WhatsApp
                </a>
              </li>
              <li>
                <a href={instagramUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink)' }}>
                  Instagram
                </a>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <MonoLabel as="div" style={{ marginBottom: 14 }}>
              Legal
            </MonoLabel>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 14, lineHeight: 1.9 }}>
              <li>
                <Link href={`${basePath}/legal/terminos`} style={{ color: 'var(--ink)' }}>
                  Términos
                </Link>
              </li>
              <li>
                <Link href={`${basePath}/legal/privacidad`} style={{ color: 'var(--ink)' }}>
                  Privacidad
                </Link>
              </li>
              <li>
                <Link href={`${basePath}/legal/cancelacion`} style={{ color: 'var(--ink)' }}>
                  Política de cancelación
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <hr className="pb-rule" style={{ marginTop: 56, marginBottom: 24 }} />

        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 16,
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 12,
            color: 'var(--ink-3)',
          }}
        >
          <p style={{ margin: 0 }}>
            © {YEAR} {buildingName} · Todos los derechos reservados
          </p>
          <p
            style={{
              margin: 0,
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              fontSize: 10,
            }}
          >
            operated by <strong style={{ color: 'var(--ink-2)', fontWeight: 600 }}>BaW</strong>
            {tagline ? ` · ${tagline}` : ''}
          </p>
        </div>
      </div>
    </footer>
  )
}
