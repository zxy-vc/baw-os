// BaW OS — Portal Propietario v2: Estados de cuenta (ADR-022 §3.2 / §4.3)
//
// El propietario ve SOLO statements emitidos o pagados (snapshots inmutables),
// nunca drafts ni queries vivas a tablas operativas. Server component con el
// mismo patrón que el dashboard del owner (owner-context + service client).

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { tryResolveOwnerContext } from '@/lib/owner-context'
import { createServiceClient } from '@/lib/api-auth'
import { ArrowLeft, FileText } from 'lucide-react'

export const dynamic = 'force-dynamic'

type StatementRow = {
  id: string
  building_id: string
  period: string
  gross_collected: number
  admin_fee: number
  expenses: number
  maintenance: number
  ownership_pct: number
  net_payout: number
  status: string
  issued_at: string | null
  building: { name: string } | null
  payouts: { id: string; amount: number; method: string; paid_date: string; reference: string | null }[]
}

function mxn(n: number): string {
  return `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
}

function periodLabel(period: string): string {
  const names = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  const [y, m] = period.split('-').map(Number)
  return `${names[m - 1]} ${y}`
}

export default async function OwnerStatementsPage() {
  const ctx = await tryResolveOwnerContext()
  if (!ctx) redirect('/login?next=/owner/estados&role=owner')

  const ownerIds = ctx.properties.map((p) => p.property_owner_id)
  const service = createServiceClient()

  let statements: StatementRow[] = []
  if (ownerIds.length > 0) {
    const { data } = await service
      .from('owner_statements')
      .select(
        'id, building_id, period, gross_collected, admin_fee, expenses, maintenance, ownership_pct, net_payout, status, issued_at, building:buildings(name), payouts:owner_payouts(id, amount, method, paid_date, reference)',
      )
      .in('owner_id', ownerIds)
      .in('status', ['issued', 'paid'])
      .order('period', { ascending: false })
    statements = (data ?? []) as unknown as StatementRow[]
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--baw-bg)' }}>
      <header
        className="border-b px-4 py-3 flex items-center gap-3"
        style={{ borderColor: 'var(--baw-border)' }}
      >
        <Link
          href="/owner"
          className="inline-flex items-center gap-1 text-[12px]"
          style={{ color: 'var(--baw-muted)' }}
        >
          <ArrowLeft size={14} /> Portal
        </Link>
        <h1 className="text-[14px] font-medium" style={{ color: 'var(--baw-text)' }}>
          Estados de cuenta
        </h1>
      </header>

      <main className="p-6 max-w-3xl mx-auto space-y-3">
        {statements.length === 0 && (
          <div
            className="rounded-lg p-8 text-center text-[12px]"
            style={{
              backgroundColor: 'var(--baw-surface)',
              border: '1px dashed var(--baw-border)',
              color: 'var(--baw-muted)',
            }}
          >
            Aún no hay estados de cuenta emitidos. Tu administrador los emite
            mes con mes.
          </div>
        )}

        {statements.map((s) => {
          const paid = s.payouts.reduce((sum, p) => sum + Number(p.amount), 0)
          return (
            <div
              key={s.id}
              className="rounded-lg p-4"
              style={{
                backgroundColor: 'var(--baw-surface)',
                border: '1px solid var(--baw-border)',
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileText size={16} style={{ color: 'var(--baw-muted)' }} />
                  <div>
                    <div className="text-[13px] font-medium" style={{ color: 'var(--baw-text)' }}>
                      {s.building?.name ?? 'Edificio'} · {periodLabel(s.period)}
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--baw-muted)' }}>
                      Participación {Number(s.ownership_pct).toFixed(2)}%
                    </div>
                  </div>
                </div>
                <span
                  className="text-[11px] px-2 py-1 rounded font-medium"
                  style={{
                    backgroundColor:
                      s.status === 'paid' ? 'var(--baw-success-bg-soft)' : 'var(--baw-warning-bg-soft)',
                    color: s.status === 'paid' ? 'var(--baw-success-fg)' : 'var(--baw-warning-fg)',
                    border: '1px solid var(--baw-border)',
                  }}
                >
                  {s.status === 'paid' ? 'Pagado' : 'Emitido'}
                </span>
              </div>

              <dl className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[12px]" style={{ color: 'var(--baw-text)' }}>
                <Item label="Cobrado" value={mxn(s.gross_collected)} />
                <Item label="Comisión" value={`−${mxn(s.admin_fee)}`} />
                <Item label="Gastos" value={`−${mxn(s.expenses)}`} />
                <Item label="Mantenimiento" value={`−${mxn(s.maintenance)}`} />
                <Item label="Tu neto" value={mxn(s.net_payout)} strong />
              </dl>

              {s.payouts.length > 0 && (
                <div className="mt-3 pt-3 border-t text-[11px]" style={{ borderColor: 'var(--baw-border)', color: 'var(--baw-muted)' }}>
                  Pagos recibidos ({mxn(paid)}):{' '}
                  {s.payouts
                    .map((p) => `${p.paid_date} ${mxn(p.amount)}${p.reference ? ` (${p.reference})` : ''}`)
                    .join(' · ')}
                </div>
              )}
            </div>
          )
        })}
      </main>
    </div>
  )
}

function Item({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--baw-muted)' }}>
        {label}
      </dt>
      <dd className={`tabular-nums ${strong ? 'font-semibold' : ''}`}>{value}</dd>
    </div>
  )
}
