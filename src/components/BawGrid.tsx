// BaW OS — Retícula 32×32 (Sprint 6 / fix sprint6-followups)
//
// Background pattern distintivo de la marca: refuerza la voz "precisión técnica"
// que ya está presente en /login. Acuerdo Sprint 6: la retícula debe verse en
// TODAS las pantallas autenticadas como elemento de continuidad visual.
//
// Implementación:
//   - Position: `fixed inset-0` por defecto (queda anclado al viewport, no
//     hace scroll con el contenido). Pasar `absolute` para layouts que lo
//     necesiten (ej. /login que vive dentro de un overlay z-[100]).
//   - z-index 0 + pointer-events-none → nunca bloquea interacción.
//   - currentColor + opacity vía CSS var `--baw-grid-opacity` (0.045 dark,
//     0.06 light, ver globals.css). Usa `var(--baw-text)` como tinta para
//     que herede del tema activo.
//   - Para que sea visible, el contenedor padre NO debe tener un background
//     opaco encima. El AppShell debe usar `bg-transparent` en el `<main>`.

interface BawGridProps {
  /** Layout strategy. `fixed` para shell global, `absolute` para overlays. */
  position?: 'fixed' | 'absolute'
  /** Override opacity. Si no se pasa, usa --baw-grid-opacity (theme-aware). */
  opacity?: number
  /** Tamaño de celda en px. Default 32. */
  cellSize?: number
  className?: string
}

export default function BawGrid({
  position = 'fixed',
  opacity,
  cellSize = 32,
  className = '',
}: BawGridProps) {
  return (
    <div
      aria-hidden
      className={`${position} inset-0 pointer-events-none ${className}`}
      style={{
        backgroundImage:
          'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
        backgroundSize: `${cellSize}px ${cellSize}px`,
        color: 'var(--baw-text)',
        opacity: opacity ?? 'var(--baw-grid-opacity, 0.045)' as unknown as number,
        zIndex: 0,
      }}
    />
  )
}
