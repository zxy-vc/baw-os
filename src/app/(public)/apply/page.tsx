// BaW OS — Landing genérico para /apply (sin token).
// Sin un link de invitación válido (`/apply/<token>`) no hay nada que mostrar,
// pero queremos que /apply NO devuelva 404 (cierra issue #21).
import BawGrid from '@/components/BawGrid'
import BawMark from '@/components/BawMark'

export default function ApplyLandingPage() {
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
          Necesitas un link de invitación
        </h1>

        <p
          className="text-sm leading-relaxed mb-8"
          style={{ color: 'var(--baw-muted)' }}
        >
          Para llenar tu solicitud de arrendamiento, pídele a tu arrendador o
          property manager que te comparta el link único que termina en
          <span
            className="mx-1"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--baw-text)' }}
          >
            /apply/&lt;tu-código&gt;
          </span>
          .
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
