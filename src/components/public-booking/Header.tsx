'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import Logo809 from './Logo809'

export default function Header({
  buildingSlug,
  buildingName,
}: {
  buildingSlug: string
  buildingName: string
}) {
  const basePath = `/edificios/${buildingSlug}`
  const NAV = [
    { label: 'Edificio', href: `${basePath}#edificio` },
    { label: 'Unidades', href: `${basePath}/unidades` },
    { label: 'Ubicación', href: `${basePath}#ubicacion` },
    { label: 'Contacto', href: `${basePath}#contacto` },
  ]
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: scrolled ? 'rgba(247, 244, 239, 0.92)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px) saturate(140%)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(12px) saturate(140%)' : 'none',
        borderBottom: scrolled ? '1px solid var(--line)' : '1px solid transparent',
        transition: 'background 200ms ease, border-color 200ms ease',
      }}
    >
      <div
        className="pb-container"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 72,
        }}
      >
        <Link href={basePath} aria-label={`${buildingName} — Inicio`} style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--ink)' }}>
          {buildingSlug === 'mateos-809' ? (
            <Logo809 size={28} />
          ) : (
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 22,
                letterSpacing: '-0.02em',
              }}
            >
              {buildingName}
            </span>
          )}
        </Link>

        {/* Desktop nav */}
        <nav
          aria-label="Principal"
          style={{ display: 'none', alignItems: 'center', gap: 32 }}
          className="pb-nav-desktop"
        >
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--ink-2)',
                letterSpacing: '0.01em',
              }}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link
            href={`${basePath}/unidades`}
            className="pb-btn pb-btn-primary"
            style={{ display: 'inline-flex' }}
          >
            Reservar
          </Link>
          {/* Mobile menu trigger */}
          <button
            type="button"
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="pb-mobile-trigger"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 40,
              height: 40,
              padding: 0,
              background: 'transparent',
              border: '1px solid var(--line-2)',
              borderRadius: 'var(--r-2)',
              color: 'var(--ink)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              {open ? (
                <path
                  d="M4 4l10 10M14 4L4 14"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              ) : (
                <>
                  <line x1="2" y1="5" x2="16" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="2" y1="9" x2="16" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="2" y1="13" x2="16" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menú"
          style={{
            position: 'fixed',
            inset: '72px 0 0 0',
            background: 'var(--bg)',
            zIndex: 49,
            display: 'flex',
            flexDirection: 'column',
            padding: 32,
            gap: 4,
          }}
        >
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              style={{
                padding: '20px 0',
                borderBottom: '1px solid var(--line)',
                fontFamily: 'var(--font-display)',
                fontSize: 28,
                color: 'var(--ink)',
                letterSpacing: '-0.02em',
              }}
            >
              {n.label}
            </Link>
          ))}
          <Link
            href={`${basePath}/unidades`}
            onClick={() => setOpen(false)}
            className="pb-btn pb-btn-primary"
            style={{ marginTop: 32, padding: '16px 24px', fontSize: 16 }}
          >
            Reservar ahora
          </Link>
        </div>
      )}

      <style>{`
        @media (min-width: 768px) {
          .pb-nav-desktop { display: flex !important; }
          .pb-mobile-trigger { display: none !important; }
        }
      `}</style>
    </header>
  )
}
