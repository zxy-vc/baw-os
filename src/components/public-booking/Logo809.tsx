import * as React from 'react'

/**
 * Logo 809 — Brand Book §01 "La regla del punto": el numeral en Outfit
 * ExtraBold (tracking −4%) y el punto terracota inmediatamente después del
 * último dígito, sentado en la línea base. No hay isotipo ni tagline: la
 * dirección es la marca.
 *
 * HTML (no SVG) para heredar la webfont cargada y `currentColor` en la tinta.
 */
export default function Logo809({
  size = 32,
  style,
  ...rest
}: { size?: number } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      role="img"
      aria-label="809"
      style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: size,
        letterSpacing: '-0.04em',
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'baseline',
        color: 'currentcolor',
        ...style,
      }}
      {...rest}
    >
      809<span aria-hidden="true" style={{ color: 'var(--accent)' }}>.</span>
    </span>
  )
}

/**
 * Lockup: numeral + dirección en voz técnica (IBM Plex Mono, caps,
 * tracking 15%). Para footer y contextos con espacio.
 */
export function Logo809Lockup({
  size = 48,
  style,
  ...rest
}: { size?: number } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      role="img"
      aria-label="809 — López Mateos 809 Pte, León, Guanajuato"
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        gap: Math.round(size * 0.18),
        color: 'currentcolor',
        ...style,
      }}
      {...rest}
    >
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: size,
          letterSpacing: '-0.04em',
          lineHeight: 1,
        }}
      >
        809<span aria-hidden="true" style={{ color: 'var(--accent)' }}>.</span>
      </span>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: Math.max(9, Math.round(size * 0.19)),
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          opacity: 0.7,
        }}
      >
        López Mateos 809 Pte · León, Gto
      </span>
    </span>
  )
}
