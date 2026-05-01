import { CreditCard } from 'lucide-react'
import SectionPlaceholder from '@/components/SectionPlaceholder'

export default function BillingPage() {
  return (
    <SectionPlaceholder
      icon={CreditCard}
      title="Billing"
      description="Sprint 4 deja publicada la ruta canónica de billing bajo Configuración. El detalle de suscripción y cobro puede aterrizarse aquí sin volver a fragmentar la navegación principal."
      ctaHref="/settings"
      ctaLabel="Ver configuración"
    />
  )
}
