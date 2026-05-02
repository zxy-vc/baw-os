// BaW OS — Platform Admin Console (L0) — Sprint 4 / S4-1.5
//
// Solo accesible para Platform Admins (fran@zxy.vc).
// L1 admins de tenant deben usar /settings/account, no /admin.

import { redirect } from 'next/navigation'
import { getPlatformAdminContext } from '@/lib/platform-admin'
import Link from 'next/link'
import { LayoutDashboard, Building2, Users, Server, Activity, Map } from 'lucide-react'

export const metadata = {
  title: 'Platform Admin · BaW OS',
}

export const dynamic = 'force-dynamic'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const admin = await getPlatformAdminContext()

  if (!admin.email) {
    redirect('/login?next=/admin')
  }

  if (!admin.isAdmin) {
    redirect('/?error=forbidden')
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--baw-bg)' }}>
      <div
        className="border-b px-4 py-3 flex items-center justify-between"
        style={{ borderColor: 'var(--baw-border)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded"
            style={{
              backgroundColor: 'var(--baw-danger-bg-2)',
              color: 'var(--baw-danger-fg)',
              border: '1px solid var(--baw-danger-border)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            L0 · Platform
          </div>
          <h1
            className="text-[14px] font-medium"
            style={{ color: 'var(--baw-text)', fontFamily: 'var(--font-mono)' }}
          >
            Platform Admin
          </h1>
        </div>
        <Link
          href="/"
          className="text-[12px]"
          style={{ color: 'var(--baw-muted)' }}
        >
          ← Volver al tenant
        </Link>
      </div>

      <nav
        className="border-b px-4 flex gap-1 overflow-x-auto"
        style={{ borderColor: 'var(--baw-border)' }}
      >
        <AdminTab href="/admin" icon={<LayoutDashboard size={14} />} label="Dashboard" />
        <AdminTab href="/admin/roadmap" icon={<Map size={14} />} label="Roadmap" />
        <AdminTab href="/admin/tenants" icon={<Building2 size={14} />} label="Tenants" />
        <AdminTab href="/admin/users" icon={<Users size={14} />} label="Usuarios" />
        <AdminTab href="/admin/admins" icon={<Server size={14} />} label="Platform Admins" />
        <AdminTab href="/admin/health" icon={<Activity size={14} />} label="Salud" />
      </nav>

      <main className="p-6">{children}</main>
    </div>
  )
}

function AdminTab({
  href,
  icon,
  label,
}: {
  href: string
  icon: React.ReactNode
  label: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 px-3 py-2 text-[12px] border-b-2 border-transparent hover:border-[var(--baw-primary)]"
      style={{ color: 'var(--baw-muted)' }}
    >
      {icon}
      {label}
    </Link>
  )
}
