// BaW OS — Platform Admin · Admins — Sprint 4 / S4-1.5

import { createServiceClient } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

type AdminRow = {
  id: string
  email: string
  granted_by: string
  granted_at: string
  notes: string | null
  user_id: string | null
}

async function getAdmins(): Promise<AdminRow[]> {
  const service = createServiceClient()
  const { data } = await service
    .from('platform_admins')
    .select('id, email, granted_by, granted_at, notes, user_id')
    .order('granted_at', { ascending: true })
  return data ?? []
}

export default async function PlatformAdminsPage() {
  const admins = await getAdmins()

  return (
    <div className="space-y-6">
      <div>
        <h2
          className="text-[18px] font-semibold mb-1"
          style={{ color: 'var(--baw-text)' }}
        >
          Platform Admins (L0)
        </h2>
        <p className="text-[12px]" style={{ color: 'var(--baw-muted)' }}>
          Cuentas con acceso a /admin. Sólo ZXY humanos. Para añadir un nuevo
          admin, ejecuta el INSERT en Supabase (audit trail vía granted_by).
        </p>
      </div>

      <div
        className="rounded-lg overflow-hidden"
        style={{
          backgroundColor: 'var(--baw-surface)',
          border: '1px solid var(--baw-border)',
        }}
      >
        <table className="w-full text-[12px]">
          <thead>
            <tr
              className="text-left"
              style={{ borderBottom: '1px solid var(--baw-border)' }}
            >
              <th className="px-4 py-2.5 font-medium" style={{ color: 'var(--baw-muted)' }}>
                Email
              </th>
              <th className="px-4 py-2.5 font-medium" style={{ color: 'var(--baw-muted)' }}>
                Concedido por
              </th>
              <th className="px-4 py-2.5 font-medium" style={{ color: 'var(--baw-muted)' }}>
                Fecha
              </th>
              <th className="px-4 py-2.5 font-medium" style={{ color: 'var(--baw-muted)' }}>
                Estado
              </th>
              <th className="px-4 py-2.5 font-medium" style={{ color: 'var(--baw-muted)' }}>
                Notas
              </th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id} style={{ borderBottom: '1px solid var(--baw-border)' }}>
                <td className="px-4 py-3" style={{ color: 'var(--baw-text)' }}>
                  {a.email}
                </td>
                <td className="px-4 py-3" style={{ color: 'var(--baw-muted)' }}>
                  {a.granted_by}
                </td>
                <td className="px-4 py-3" style={{ color: 'var(--baw-muted)' }}>
                  {new Date(a.granted_at).toLocaleDateString('es-MX')}
                </td>
                <td className="px-4 py-3">
                  <span
                    className="px-1.5 py-0.5 text-[10px] rounded uppercase tracking-wider"
                    style={{
                      backgroundColor: a.user_id
                        ? 'var(--baw-success-bg-2)'
                        : 'var(--baw-warning-bg-2)',
                      color: a.user_id ? 'var(--baw-success-fg)' : 'var(--baw-warning-fg)',
                      border: `1px solid ${
                        a.user_id ? 'var(--baw-success-border)' : 'var(--baw-warning-border)'
                      }`,
                    }}
                  >
                    {a.user_id ? 'Activo' : 'Pendiente login'}
                  </span>
                </td>
                <td className="px-4 py-3" style={{ color: 'var(--baw-muted)' }}>
                  {a.notes ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        className="rounded-lg p-4 text-[12px]"
        style={{
          backgroundColor: 'var(--baw-info-bg-soft)',
          border: '1px solid var(--baw-info-border)',
          color: 'var(--baw-muted)',
        }}
      >
        <strong style={{ color: 'var(--baw-text)' }}>Nota arquitectónica:</strong>{' '}
        Los agentes ZXY (Hugo-COS, Alicia-Ops, Conta-Beto, Maribel-Law,
        Luis-Growth, Andres-Tech) NO tienen acceso L0 propio. Operan dentro del
        tenant que los contrata vía rol <code>agent</code> en{' '}
        <code>org_members</code>.
      </div>
    </div>
  )
}
