'use client'

/**
 * BaW OS — /onboarding · router inteligente (Sprint 4 / S4-0)
 *
 * Si el usuario aún NO tiene PM Company → muestra el wizard de first-run.
 * Si el usuario YA está onboardeado → muestra "Configurar cuenta", la
 * sección de admin del PM Owner: estado de la cuenta, atajos para agregar
 * edificios/unidades/propietarios/contratos, importar CSV, gestión de
 * equipo (placeholder) y zona peligrosa.
 *
 * Acuerdo canónico Sprint 4 #1: esta vista vive bajo Configuración, no
 * bajo Inquilinos. Label en sub-nav: "Configurar cuenta".
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Building2,
  Briefcase,
  Home,
  Users,
  FileText,
  Upload,
  UserPlus,
  Sparkles,
  ArrowRight,
  ShieldAlert,
  Loader2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useActiveContext } from '@/lib/useActiveContext'
import WizardFirstRun from './WizardFirstRun'

interface AccountStats {
  buildings: number
  units: number
  owners: number
  contracts: number
}

export default function OnboardingPage() {
  const { loading: ctxLoading, orgs, activeOrgId, userEmail } = useActiveContext()
  const [stats, setStats] = useState<AccountStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  const activeOrg = useMemo(
    () => orgs.find((o) => o.id === activeOrgId) || null,
    [orgs, activeOrgId],
  )

  const isFirstRun = !ctxLoading && (orgs.length === 0 || !activeOrgId)

  useEffect(() => {
    if (ctxLoading || isFirstRun || !activeOrgId) return

    let cancelled = false
    async function loadStats() {
      setStatsLoading(true)
      try {
        const [b, u, o, c] = await Promise.all([
          supabase
            .from('buildings')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', activeOrgId),
          supabase
            .from('units')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', activeOrgId),
          supabase
            .from('property_owners')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', activeOrgId),
          supabase
            .from('contracts')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', activeOrgId),
        ])
        if (cancelled) return
        setStats({
          buildings: b.count ?? 0,
          units: u.count ?? 0,
          owners: o.count ?? 0,
          contracts: c.count ?? 0,
        })
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Configurar cuenta: error cargando stats', e)
      } finally {
        if (!cancelled) setStatsLoading(false)
      }
    }
    loadStats()
    return () => {
      cancelled = true
    }
  }, [ctxLoading, isFirstRun, activeOrgId])

  if (ctxLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    )
  }

  if (isFirstRun) {
    return <WizardFirstRun />
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1
          className="text-[28px] tracking-tight"
          style={{ color: 'var(--baw-text)', fontFamily: 'var(--font-display)' }}
        >
          Configurar cuenta
        </h1>
        <p
          className="mt-1 text-[11px] uppercase tracking-wider"
          style={{ color: 'var(--baw-muted)', fontFamily: 'var(--font-mono)' }}
        >
          Administra tu PM Company · agrega activos · gestiona el equipo
        </p>
      </div>

      {/* Estado de la cuenta */}
      <section className="card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Briefcase className="w-4 h-4 text-indigo-500 shrink-0" />
              <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                PM Company activa
              </span>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
              {activeOrg?.name || '—'}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
              slug: <span className="tabular-nums">{activeOrg?.slug || '—'}</span>
              {userEmail && <> · {userEmail}</>}
            </p>
          </div>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0"
          >
            Editar
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {/* Stats rápidas */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCell
            icon={Building2}
            label="Edificios"
            value={stats?.buildings}
            loading={statsLoading}
            href="/buildings"
          />
          <StatCell
            icon={Home}
            label="Unidades"
            value={stats?.units}
            loading={statsLoading}
            href="/units"
          />
          <StatCell
            icon={Users}
            label="Propietarios"
            value={stats?.owners}
            loading={statsLoading}
            href="/owners"
          />
          <StatCell
            icon={FileText}
            label="Contratos"
            value={stats?.contracts}
            loading={statsLoading}
            href="/contracts"
          />
        </div>
      </section>

      {/* Atajos para agregar */}
      <section>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
          Agregar nuevos activos
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ShortcutCard
            icon={Building2}
            title="Nuevo edificio"
            description="Agrega un edificio adicional a tu portafolio."
            href="/buildings"
          />
          <ShortcutCard
            icon={Home}
            title="Nueva unidad"
            description="Da de alta una unidad bajo un edificio existente."
            href="/units"
          />
          <ShortcutCard
            icon={Users}
            title="Nuevo propietario"
            description="Registra a un dueño y asigna su % en edificios."
            href="/owners"
          />
          <ShortcutCard
            icon={FileText}
            title="Nuevo contrato"
            description="Crea un contrato de arrendamiento."
            href="/contracts/new"
          />
        </div>
      </section>

      {/* Importar / Bulk */}
      <section>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
          Importar datos
        </h3>
        <ShortcutCard
          icon={Upload}
          title="Importar unidades desde CSV"
          description="Carga masiva de unidades, ocupantes y contratos vigentes."
          href="/onboarding/bulk"
        />
      </section>

      {/* Equipo */}
      <section>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
          Equipo
        </h3>
        <div className="card p-4 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="flex items-center justify-center w-9 h-9 rounded-md shrink-0"
              style={{
                backgroundColor: 'var(--baw-agent-bg-soft)',
                color: 'var(--baw-primary)',
              }}
            >
              <UserPlus className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                Invitar miembros del equipo
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Agrega pm_admin, pm_operator o pm_viewer.
              </div>
            </div>
          </div>
          <span
            className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded shrink-0"
            style={{
              backgroundColor: 'var(--baw-warning-bg-soft)',
              color: 'var(--baw-warning-fg)',
              border: '1px solid var(--baw-warning-border)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            Próximamente
          </span>
        </div>
      </section>

      {/* Agentes */}
      <section>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
          Automatización
        </h3>
        <Link
          href="/agents"
          className="card p-4 flex items-start justify-between gap-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        >
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="flex items-center justify-center w-9 h-9 rounded-md shrink-0"
              style={{
                backgroundColor: 'var(--baw-agent-bg-soft)',
                color: 'var(--baw-primary)',
              }}
            >
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                Configurar agentes
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Activa o pausa los 10+1 agentes (Cobranza, Mantenimiento, etc.).
              </div>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400 shrink-0 mt-1" />
        </Link>
      </section>

      {/* Zona peligrosa */}
      <section>
        <h3 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-3 flex items-center gap-1.5">
          <ShieldAlert className="w-4 h-4" />
          Zona peligrosa
        </h3>
        <div
          className="card p-4 flex items-start justify-between gap-4"
          style={{
            borderColor: 'var(--baw-danger-border-soft)',
          }}
        >
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              Eliminar PM Company
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Borra todos los edificios, unidades, contratos y propietarios. No se puede deshacer.
            </div>
          </div>
          <span
            className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded shrink-0"
            style={{
              backgroundColor: 'var(--baw-warning-bg-soft)',
              color: 'var(--baw-warning-fg)',
              border: '1px solid var(--baw-warning-border)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            Próximamente
          </span>
        </div>
      </section>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Sub-componentes
// -----------------------------------------------------------------------------

function StatCell({
  icon: Icon,
  label,
  value,
  loading,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number | undefined
  loading: boolean
  href: string
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-gray-200 dark:border-gray-800 p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
    >
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <div className="text-xl font-semibold text-gray-900 dark:text-white tabular-nums">
        {loading ? <span className="text-gray-400">—</span> : (value ?? 0)}
      </div>
    </Link>
  )
}

function ShortcutCard({
  icon: Icon,
  title,
  description,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  href: string
}) {
  return (
    <Link
      href={href}
      className="card p-4 flex items-start justify-between gap-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group"
    >
      <div className="flex items-start gap-3 min-w-0">
        <div
          className="flex items-center justify-center w-9 h-9 rounded-md shrink-0"
          style={{
            backgroundColor: 'var(--baw-agent-bg-soft)',
            color: 'var(--baw-primary)',
          }}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {title}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {description}
          </div>
        </div>
      </div>
      <ArrowRight className="w-4 h-4 text-gray-400 shrink-0 mt-1 group-hover:text-indigo-500 transition-colors" />
    </Link>
  )
}
