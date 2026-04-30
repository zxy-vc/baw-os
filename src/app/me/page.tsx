// BaW OS — User Profile (L2) — Sprint 4 / S4-1.5
//
// Página personal del usuario. NO depende de org. Cada usuario tiene una sola
// página /me sin importar a cuántos tenants pertenezca.

import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/api-auth'
import { getPlatformAdminContext } from '@/lib/platform-admin'
import Link from 'next/link'
import MePreferencesForm from './MePreferencesForm'

export const metadata = { title: 'Mi perfil · BaW OS' }
export const dynamic = 'force-dynamic'

type Membership = {
  org_id: string
  role: string
  org_name: string
  org_slug: string
}

async function getData() {
  const supabase = createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const service = createServiceClient()

  const [profileR, prefsR, membershipsR] = await Promise.all([
    service
      .from('user_profiles')
      .select('full_name, avatar_url')
      .eq('user_id', user.id)
      .maybeSingle(),
    service
      .from('user_preferences')
      .select('locale, timezone, notification_prefs, theme')
      .eq('user_id', user.id)
      .maybeSingle(),
    service
      .from('org_members')
      .select('org_id, role, organizations(name, slug)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true }),
  ])

  const memberships: Membership[] = (membershipsR.data ?? []).map(
    (m: {
      org_id: string
      role: string
      organizations: { name: string; slug: string } | { name: string; slug: string }[] | null
    }) => {
      const org = Array.isArray(m.organizations) ? m.organizations[0] : m.organizations
      return {
        org_id: m.org_id,
        role: m.role,
        org_name: org?.name ?? '—',
        org_slug: org?.slug ?? '',
      }
    },
  )

  const adminCtx = await getPlatformAdminContext()

  return {
    user: {
      id: user.id,
      email: user.email ?? null,
      full_name: profileR.data?.full_name ?? null,
      avatar_url: profileR.data?.avatar_url ?? null,
    },
    prefs: prefsR.data ?? {
      locale: 'es',
      timezone: 'America/Mexico_City',
      notification_prefs: { email: true, whatsapp: true, in_app: true },
      theme: 'dark',
    },
    memberships,
    isPlatformAdmin: adminCtx.isAdmin,
  }
}

export default async function MePage() {
  const data = await getData()
  if (!data) redirect('/login?next=/me')

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <div
          className="text-[10px] uppercase tracking-wider mb-1"
          style={{ color: 'var(--baw-muted)' }}
        >
          L2 · Usuario
        </div>
        <h1
          className="text-[20px] font-semibold"
          style={{ color: 'var(--baw-text)' }}
        >
          Mi perfil
        </h1>
        <p className="text-[12px]" style={{ color: 'var(--baw-muted)' }}>
          Preferencias personales que viajan contigo entre tenants.
        </p>
      </div>

      {/* Identity */}
      <section
        className="rounded-lg p-5"
        style={{
          backgroundColor: 'var(--baw-surface)',
          border: '1px solid var(--baw-border)',
        }}
      >
        <h2
          className="text-[14px] font-medium mb-3"
          style={{ color: 'var(--baw-text)' }}
        >
          Identidad
        </h2>
        <div className="grid grid-cols-2 gap-4 text-[12px]">
          <Field label="Email" value={data.user.email ?? '—'} />
          <Field label="Nombre" value={data.user.full_name ?? '—'} />
          <Field label="User ID" value={data.user.id} mono />
          <Field
            label="Plataforma"
            value={data.isPlatformAdmin ? 'L0 — Platform Admin' : 'Usuario regular'}
          />
        </div>
      </section>

      {/* Memberships */}
      <section
        className="rounded-lg p-5"
        style={{
          backgroundColor: 'var(--baw-surface)',
          border: '1px solid var(--baw-border)',
        }}
      >
        <h2
          className="text-[14px] font-medium mb-3"
          style={{ color: 'var(--baw-text)' }}
        >
          Tus organizaciones ({data.memberships.length})
        </h2>
        {data.memberships.length === 0 ? (
          <p className="text-[12px]" style={{ color: 'var(--baw-muted)' }}>
            No perteneces a ninguna organización aún.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--baw-border)' }}>
            {data.memberships.map((m) => (
              <li
                key={m.org_id}
                className="py-2 flex items-center justify-between"
                style={{ borderColor: 'var(--baw-border)' }}
              >
                <div>
                  <div className="text-[13px]" style={{ color: 'var(--baw-text)' }}>
                    {m.org_name}
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--baw-muted)' }}>
                    {m.org_slug}
                  </div>
                </div>
                <span
                  className="px-1.5 py-0.5 text-[10px] rounded uppercase tracking-wider"
                  style={{
                    backgroundColor: 'rgba(59,130,246,0.12)',
                    color: '#93C5FD',
                    border: '1px solid rgba(59,130,246,0.25)',
                  }}
                >
                  {m.role}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Preferences (client form) */}
      <MePreferencesForm initial={data.prefs} />

      {/* Quick links */}
      <section className="text-[12px] flex flex-wrap gap-3">
        <Link
          href="/settings"
          className="underline"
          style={{ color: 'var(--baw-primary)' }}
        >
          Configuración del tenant (L1)
        </Link>
        {data.isPlatformAdmin && (
          <Link
            href="/admin"
            className="underline"
            style={{ color: 'var(--baw-primary)' }}
          >
            Platform Admin (L0)
          </Link>
        )}
      </section>
    </div>
  )
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div>
      <div
        className="text-[10px] uppercase tracking-wider mb-0.5"
        style={{ color: 'var(--baw-muted)' }}
      >
        {label}
      </div>
      <div
        className={mono ? 'font-mono text-[11px] break-all' : ''}
        style={{ color: 'var(--baw-text)' }}
      >
        {value}
      </div>
    </div>
  )
}
