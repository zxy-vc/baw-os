import Link from 'next/link'
import MonoLabel from './MonoLabel'
import { Logo809Lockup } from './Logo809'

const YEAR = new Date().getFullYear()

export default function Footer() {
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
              <Logo809Lockup size={56} />
            </div>
            <p style={{ marginTop: 20, fontSize: 14, lineHeight: 1.6, maxWidth: 280 }}>
              Doce departamentos amueblados de estancia corta en una sola dirección de León, Guanajuato.
            </p>
          </div>

          {/* Address */}
          <div>
            <MonoLabel as="div" style={{ marginBottom: 14 }}>
              Dirección
            </MonoLabel>
            <address style={{ fontStyle: 'normal', fontSize: 14, lineHeight: 1.7, color: 'var(--ink)' }}>
              Mateos 809
              <br />
              Colonia Centro
              <br />
              León, Guanajuato
              <br />
              México
            </address>
          </div>

          {/* Contact */}
          <div>
            <MonoLabel as="div" style={{ marginBottom: 14 }}>
              Contacto
            </MonoLabel>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 14, lineHeight: 1.9 }}>
              <li>
                <a href="mailto:hola@baw.mx" style={{ color: 'var(--ink)' }}>
                  hola@baw.mx
                </a>
              </li>
              <li>
                <a href="https://wa.me/524771234567" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink)' }}>
                  WhatsApp
                </a>
              </li>
              <li>
                <a href="https://instagram.com/baw.mx" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink)' }}>
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
                <Link href="/mateos-809/legal/terminos" style={{ color: 'var(--ink)' }}>
                  Términos
                </Link>
              </li>
              <li>
                <Link href="/mateos-809/legal/privacidad" style={{ color: 'var(--ink)' }}>
                  Privacidad
                </Link>
              </li>
              <li>
                <Link href="/mateos-809/legal/cancelacion" style={{ color: 'var(--ink)' }}>
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
            © {YEAR} Mateos 809 · Operado por <strong style={{ color: 'var(--ink-2)', fontWeight: 500 }}>BaW</strong>, sistema de gestión inmobiliaria — ADR-017
          </p>
          <p style={{ margin: 0, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: 10 }}>
            12 estancias · 1 dirección
          </p>
        </div>
      </div>
    </footer>
  )
}
