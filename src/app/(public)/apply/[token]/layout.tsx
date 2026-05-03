// BaW OS — Layout de la solicitud pública de arrendamiento.
// Vive dentro del route group `(public)` (sin AppShell). Pasa-through:
// el chrome (BawGrid + BawMark) lo dibuja cada page para mantener
// consistencia con /login y not-found.tsx.

export default function ApplyTokenLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
