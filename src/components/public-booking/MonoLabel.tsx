import * as React from 'react'

/**
 * Label tipográfico — JetBrains Mono, mayúsculas, letter-spacing amplio.
 * Para overlines, etiquetas de sección y micro-metadatos.
 */
type MonoLabelProps = {
  children: React.ReactNode
  as?: keyof JSX.IntrinsicElements
  size?: number
  color?: string
  htmlFor?: string
} & React.HTMLAttributes<HTMLElement>

export default function MonoLabel({
  children,
  as: As = 'span',
  size = 11,
  color,
  style,
  htmlFor,
  ...rest
}: MonoLabelProps) {
  return React.createElement(
    As,
    {
      ...(rest as Record<string, unknown>),
      htmlFor,
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
