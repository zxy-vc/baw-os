import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Portal Inquilino — BaW',
  description: 'Portal de inquilino — BaW Administración de propiedades',
}

export default function TenantLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
