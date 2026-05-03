// BaW OS — Token de solicitud inválido o expirado
import BawGrid from '@/components/BawGrid'
import BawMark from '@/components/BawMark'

export default function ApplyTokenNotFound() {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ backgroundColor: 'var(--baw-bg)' }}
    >
      <BawGrid position="absolute" />
      <div className="relative w-full max-w-md mx-auto px-6 text-center">
        <div
          className="flex justify-center mb-10"
          style={{ color: 'var(--baw-text)' }}
        >
          <BawMark size={48} withWordmark wordmarkSize="lg" />
        </div>

        <h1
          className="text-[20px] font-semibold mb-3 tracking-tight"
          style={{ color: 'var(--baw-text)' }}
        >
          Este link ya no es válido
        </h1>

        <p
          className="text-sm leading-relaxed mb-8"
          style={{ color: 'var(--baw-muted)' }}
        >
          El link de invitación que abriste expiró o ya no existe. Pídele a tu
          arrendador o property manager que te genere uno nuevo.
        </p>

        <p
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--baw-faint)' }}
          className="text-[10px] uppercase tracking-[0.2em]"
        >
          BaW OS · Property Management
        </p>
      </div>
    </div>
  )
}
