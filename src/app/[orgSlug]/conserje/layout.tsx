import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Conserje · BaW OS',
}

// Conserje es un kiosk para tablet en lobby. Forzamos modo oscuro por
// usabilidad nocturna y para que no dependa del theme del navegador del
// dispositivo del conserje.
export default function ConserjeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="dark" className="min-h-screen bg-slate-950 text-slate-100">
      {children}
    </div>
  )
}
