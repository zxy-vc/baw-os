import * as React from 'react'

/**
 * Logo numeral "809" — inline SVG para que use `currentColor`.
 * Para el lockup con "MATEOS · LEÓN · GTO" usar `<Logo809Lockup />`.
 */
export default function Logo809({
  size = 32,
  ...rest
}: { size?: number } & React.SVGAttributes<SVGSVGElement>) {
  const ratio = 120 / 48
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 120 48"
      width={size * ratio}
      height={size}
      fill="none"
      role="img"
      aria-label="Mateos 809"
      {...rest}
    >
      <text
        x="0"
        y="38"
        fontFamily="var(--font-display)"
        fontSize="42"
        fontWeight="400"
        letterSpacing="-0.025em"
        fill="currentColor"
      >
        809
      </text>
      <rect x="78" y="6" width="2" height="36" fill="currentColor" />
    </svg>
  )
}

export function Logo809Lockup({
  size = 48,
  ...rest
}: { size?: number } & React.SVGAttributes<SVGSVGElement>) {
  const ratio = 320 / 60
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 320 60"
      width={size * ratio}
      height={size}
      fill="none"
      role="img"
      aria-label="Mateos 809 — León, Guanajuato"
      {...rest}
    >
      <text
        x="0"
        y="44"
        fontFamily="var(--font-display)"
        fontSize="48"
        fontWeight="400"
        letterSpacing="-0.025em"
        fill="currentColor"
      >
        809
      </text>
      <rect x="92" y="14" width="1.5" height="36" fill="currentColor" opacity="0.4" />
      <text
        x="108"
        y="32"
        fontFamily="var(--font-body)"
        fontSize="12"
        fontWeight="500"
        letterSpacing="0.16em"
        fill="currentColor"
      >
        MATEOS
      </text>
      <text
        x="108"
        y="48"
        fontFamily="var(--font-body)"
        fontSize="10"
        fontWeight="400"
        letterSpacing="0.10em"
        fill="currentColor"
        opacity="0.65"
      >
        LEÓN · GTO
      </text>
    </svg>
  )
}
