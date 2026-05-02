// BaW OS — Grid background reutilizable
//
// Retícula sutil 32×32 en currentColor con opacidad 3.5%. Comunica precisión
// técnica de la marca. Se usa en /login y se extiende al chrome de la
// plataforma para dar continuidad visual entre login y dashboard.
//
// Uso:
//   <BawGrid />                   // absoluta, hereda inset
//   <BawGrid fixed />             // fixed inset-0 (para layouts full-bleed)
//   <BawGrid size={24} />         // grid más denso

interface BawGridProps {
  size?: number
  opacity?: number
  fixed?: boolean
  className?: string
}

export default function BawGrid({
  size = 32,
  opacity = 0.035,
  fixed = false,
  className = '',
}: BawGridProps) {
  return (
    <div
      aria-hidden
      className={`${fixed ? 'fixed' : 'absolute'} inset-0 pointer-events-none ${className}`}
      style={{
        backgroundImage:
          'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
        backgroundSize: `${size}px ${size}px`,
        opacity,
        color: 'var(--baw-text)',
        // Asegura que viva en el fondo, no encima de inputs / botones.
        zIndex: 0,
      }}
    />
  )
}
