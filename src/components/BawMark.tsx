// BaW OS — Mark A (Wordmark Explorations v2) — componente reutilizable
//
// 3 placas con desfase pronunciado en X (offsets +6 / -6) que se asume como
// decisión de diseño: rompe la lectura de "cubo mal dibujado" y comunica
// capas operativas / floors de software / jerarquía. Color hereda de
// currentColor.
//
// Histórico: durante Sprint 5.5 se probó Mark B (placas alineadas a eje
// vertical) en /login. Tras verlo en producción se eligió volver a Mark A
// — el desfase es la voz de la marca.
//
// Uso:
//   <BawMark size={32} />              // mark solo
//   <BawMark size={32} withWordmark /> // mark + "BaW OS" en IBM Plex Mono
//   <BawMark size={32} withWordmark wordmarkSize="sm" />

import { cn } from '@/lib/utils'

interface BawMarkProps {
  size?: number
  withWordmark?: boolean
  wordmarkSize?: 'sm' | 'md' | 'lg'
  showOS?: boolean
  className?: string
}

const WORDMARK_SIZES = {
  sm: { brand: 'text-[13px]', os: 'text-[10px]' },
  md: { brand: 'text-[16px]', os: 'text-[12px]' },
  lg: { brand: 'text-[20px]', os: 'text-[14px]' },
}

export default function BawMark({
  size = 24,
  withWordmark = false,
  wordmarkSize = 'md',
  showOS = true,
  className,
}: BawMarkProps) {
  const sizes = WORDMARK_SIZES[wordmarkSize]

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <svg
        viewBox="0 0 120 120"
        width={size}
        height={size}
        fill="none"
        aria-label="BaW"
        className="block shrink-0"
      >
        <path d="M10 82 L60 100 L110 82 L60 64 Z" fill="currentColor" />
        <path d="M16 58 L66 76 L116 58 L66 40 Z" fill="currentColor" opacity="0.7" />
        <path d="M4 34 L54 52 L104 34 L54 16 Z" fill="currentColor" opacity="0.5" />
      </svg>

      {withWordmark && (
        <span
          style={{ fontFamily: 'var(--font-mono)' }}
          className={cn('font-medium leading-none tracking-tight', sizes.brand)}
        >
          BaW
          {showOS && (
            <span className={cn('ml-1.5 font-normal opacity-55 tracking-wide', sizes.os)}>
              / OS
            </span>
          )}
        </span>
      )}
    </div>
  )
}
