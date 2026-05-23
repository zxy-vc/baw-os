import * as React from 'react'

/**
 * Label tipográfico — JetBrains Mono, mayúsculas, letter-spacing amplio.
 * Para overlines, etiquetas de sección y micro-metadatos.
 */
export default function MonoLabel({
  children,
  as: As = 'span',
  size = 11,
  color,
  style,
  ...rest
}: {
  children: React.ReactNode
  as?: keyof JSX.IntrinsicElements
  size?: number
  color?: string
} & React.HTMLAttributes<HTMLElement>) {
  return React.createElement(
    As,
    {
      ...rest,
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: size,
        textTransform: 'uppercase',
        letterSpacing: '0.10em',
        fontWeight: 500,
        color: color ?? 'var(--ink-3)',
        ...style,
      },
    },
    children
  )
}
