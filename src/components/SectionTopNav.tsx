'use client'

/**
 * SectionTopNav — sub-navegación horizontal contextual (Sprint 4 / S4-0).
 *
 * Acuerdo canónico #1: cuando una sección del sidebar tiene >1 vista,
 * mostramos pills horizontales arriba del contenido. Inspiración: Stripe,
 * Linear, Apple Mail. Si la sección tiene una sola vista, no se renderiza.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { findSection, isSubNavItemActive } from '@/lib/navigation'
import { cn } from '@/lib/utils'

export default function SectionTopNav() {
  const pathname = usePathname()
  const section = findSection(pathname)

  if (!section || !section.subNav || section.subNav.length <= 1) {
    return null
  }

  return (
    <div
      className="sticky z-20 px-4 md:px-6"
      style={{
        // El header mide 56px + safe-area (viewportFit: 'cover'); un top-14
        // fijo se metería debajo del notch en iPhone.
        top: 'calc(3.5rem + env(safe-area-inset-top))',
        backgroundColor: 'var(--baw-bg)',
        borderBottom: '1px solid var(--baw-border)',
      }}
    >
      <nav
        className="flex items-center gap-1 overflow-x-auto h-11"
        aria-label={`Sub-navegación de ${section.label}`}
      >
        {section.subNav.map((item) => {
          const active = isSubNavItemActive(item, pathname)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'inline-flex items-center h-9 sm:h-7 px-3.5 sm:px-3 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors'
              )}
              style={{
                backgroundColor: active ? 'var(--baw-surface)' : 'transparent',
                color: active ? 'var(--baw-text)' : 'var(--baw-muted)',
                border: active
                  ? '1px solid var(--baw-border)'
                  : '1px solid transparent',
              }}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
