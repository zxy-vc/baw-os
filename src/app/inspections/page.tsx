import { ClipboardCheck } from 'lucide-react'
import SectionPlaceholder from '@/components/SectionPlaceholder'

export default function InspectionsPage() {
  return (
    <SectionPlaceholder
      icon={ClipboardCheck}
      title="Inspecciones"
      description="La ruta canónica de inspecciones ya existe en la navegación consolidada de Sprint 4. El flujo detallado todavía se concentra en Operación y puede aterrizarse aquí sin abrir otra categoría en el sidebar."
      ctaHref="/maintenance"
      ctaLabel="Ir a mantenimiento"
    />
  )
}
