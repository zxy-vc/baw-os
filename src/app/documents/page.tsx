import { FileText } from 'lucide-react'
import SectionPlaceholder from '@/components/SectionPlaceholder'

export default function DocumentsPage() {
  return (
    <SectionPlaceholder
      icon={FileText}
      title="Documentos"
      description="La vista canónica de documentos ya está anclada en la navegación S4-0. Mientras se materializa el módulo dedicado, esta sección sirve como punto estable de entrada dentro de Operación."
      ctaHref="/search"
      ctaLabel="Explorar operación"
    />
  )
}
