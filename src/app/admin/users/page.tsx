// BaW OS — Platform Admin · Users — Sprint 4 / S4-1.5

import { createServiceClient } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

type UserRow = {
  user_id: string
  email: string | null
  org_count: number
  roles: string[]
  is_platform_admin: boolean
}

async function getUsers(): Promise<UserRow[]> {
  const service = createServiceClient()

  // Auth users via admin API
  const { data: authData } = await service.auth.admin.listUsers({ perPage: 200 })
  const users = authData?.users ?? []

  const { data: members } = await service
    .from('org_members')
    .select('user_id, role')

  const { data: pAdmins } = await service.from('platform_admins').select('email')
  const adminEmails = new Set(
    (pAdmins ?? []).map((a: { email: string }) => a.email.toLowerCase()),
  )

  const memberMap = new Map<string, { count: number; roles: Set<string> }>()
  for (const m of members ?? []) {
    const cur = memberMap.get(m.user_id) ?? { count: 0, roles: new Set<string>() }
    cur.count += 1
    cur.roles.add(m.role)
    memberMap.set(m.user_id, cur)
  }

  return users.map((u) => {
    const info = memberMap.get(u.id)
    return {
      user_id: u.id,
      email: u.email ?? null,
      org_count: info?.count ?? 0,
      roles: Array.from(info?.roles ?? []),
      is_platform_admin:
        !!u.email && adminEmails.has(u.email.toLowerCase()),
    }
  })
}

export default async function UsersPage() {
  const users = await getUsers()

  return (
    <div className="space-y-6">
      <div>
        <h2
          className="text-[18px] font-semibold mb-1"
          style={{ color: 'var(--baw-text)' }}
        >
          Usuarios ({users.length})
        </h2>
        <p className="text-[12px]" style={{ color: 'var(--baw-muted)' }}>
          Todos los usuarios registrados en la plataforma. Los Platform Admins
          se marcan con badge L0.
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
              <th
                className="px-4 py-2.5 font-medium tabular-nums text-right"
                style={{ color: 'var(--baw-muted)' }}
              >
                Orgs
              </th>
              <th className="px-4 py-2.5 font-medium" style={{ color: 'var(--baw-muted)' }}>
                Roles
              </th>
              <th className="px-4 py-2.5 font-medium" style={{ color: 'var(--baw-muted)' }}>
                Plataforma
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.user_id} style={{ borderBottom: '1px solid var(--baw-border)' }}>
                <td className="px-4 py-3" style={{ color: 'var(--baw-text)' }}>
                  {u.email ?? <span style={{ color: 'var(--baw-muted)' }}>(sin email)</span>}
                </td>
                <td
                  className="px-4 py-3 tabular-nums text-right"
                  style={{ color: 'var(--baw-text)' }}
                >
                  {u.org_count}
                </td>
                <td className="px-4 py-3" style={{ color: 'var(--baw-muted)' }}>
                  {u.roles.length === 0 ? '—' : u.roles.join(', ')}
                </td>
                <td className="px-4 py-3">
                  {u.is_platform_admin ? (
                    <span
                      className="px-1.5 py-0.5 text-[10px] rounded uppercase tracking-wider"
                      style={{
                        backgroundColor: 'var(--baw-danger-bg-2)',
                        color: 'var(--baw-danger-fg)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                      }}
                    >
                      L0
                    </span>
                  ) : (
                    <span style={{ color: 'var(--baw-muted)' }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
