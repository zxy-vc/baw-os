// BaW OS — Solicitud pública de arrendamiento (Server Component)
//
// Carga la aplicación por `token` con el cliente anon de Supabase (RLS permite
// SELECT a anon, ver migration 20260404_tenant_intake.sql líneas 51-61).
//
// - Si el token no existe → notFound() (renderea not-found.tsx)
// - Si la tabla no existe en este entorno → schemaMissing fallback (mismo
//   patrón que /applications). Esto evita romper preview deploys donde la
//   migración aún no fue aplicada.
// - Si todo OK → pasa la row inicial al Client Component <ApplyForm/>.

import { notFound } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase-server'
import type { TenantApplication } from '@/types'
import ApplyForm from './ApplyForm'
import BawGrid from '@/components/BawGrid'
import BawMark from '@/components/BawMark'

interface PageProps {
  params: { token: string }
}

export const dynamic = 'force-dynamic'

export default async function ApplyPage({ params }: PageProps) {
  const { token } = params
  const supabase = createSupabaseServer()

  const { data, error } = await supabase
    .from('tenant_applications')
    .select(
      'id, org_id, unit_id, contract_type, status, token, titulares, avales, contract_data, empresa, tercero_pagador, docs, submitted_at, reviewed_by, reviewed_at, notes, created_at, updated_at'
    )
    .eq('token', token)
    .maybeSingle()

  // Tabla no existe (preview deploy sin migración aplicada)
  if (error && /tenant_applications/i.test(error.message)) {
    return <SchemaMissingScreen />
  }

  if (!data) {
    notFound()
  }

  return <ApplyForm initialData={data as TenantApplication} />
}

function SchemaMissingScreen() {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ backgroundColor: 'var(--baw-bg)' }}
    >
      <BawGrid position="absolute" />
      <div className="relative w-full max-w-md mx-auto px-6 text-center">
        <div className="flex justify-center mb-8" style={{ color: 'var(--baw-text)' }}>
          <BawMark size={48} withWordmark wordmarkSize="lg" />
        </div>
        <div
          className="rounded-md p-6 text-left"
          style={{
            backgroundColor: 'var(--baw-danger-bg-soft)',
            border: '1px solid var(--baw-danger-border)',
            color: 'var(--baw-danger-fg)',
          }}
        >
          <h2 className="text-sm font-semibold mb-2">Solicitudes no habilitadas</h2>
          <p className="text-xs leading-relaxed">
            La base de datos conectada todavía no tiene la tabla{' '}
            <code className="font-mono">tenant_applications</code>. Falta aplicar la
            migración de tenant intake en este entorno.
          </p>
        </div>
      </div>
    </div>
  )
}
