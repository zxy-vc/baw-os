// BaW OS — Owner Portal v2 Layout (Sprint 4 / S4-2)
//
// Chrome propio sin Sidebar de PM. Header diferenciado para que el owner
// sepa que está viendo SUS propiedades, no las de un PM.

export const metadata = {
  title: 'Portal del Propietario · BaW',
}

export const dynamic = 'force-dynamic'

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
