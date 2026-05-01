import { Users } from 'lucide-react'
import SectionPlaceholder from '@/components/SectionPlaceholder'

export default function TeamPage() {
  return (
    <SectionPlaceholder
      icon={Users}
      title="Equipo"
      description="La navegación consolidada ya expone la ruta canónica de equipo. La administración actual de accesos y miembros sigue disponible en Configuración mientras se desacopla a su vista propia."
      ctaHref="/settings"
      ctaLabel="Abrir configuración"
    />
  )
}
