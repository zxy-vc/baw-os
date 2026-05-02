// BaW OS — Internal Roadmap Dashboard (L0 only)
// Notion spec: 354169373e7281e7b4eef78ea5031e47
// v1: snapshot estático canónico (Sprint 4 cierre)
// v2 (futuro): fetchNotionBoard + fetchGithubData con ISR revalidate=300

import { redirect } from 'next/navigation'
import { isPlatformAdmin } from '@/lib/platform-admin'
import { ROADMAP_SNAPSHOT, TIER_COLORS, type Tier, type Status } from './lib/snapshot'

export const dynamic = 'force-dynamic'

const STATUS_BG: Record<SprintStatusKey, string> = {
  done: 'rgba(16,185,129,0.12)',
  next: 'rgba(245,158,11,0.12)',
  future: 'rgba(107,114,128,0.12)',
}
const STATUS_FG: Record<SprintStatusKey, string> = {
  done: '#10b981',
  next: '#f59e0b',
  future: '#6b7280',
}
type SprintStatusKey = 'done' | 'next' | 'future'

function tierStyle(tier: Tier) {
  const c = TIER_COLORS[tier]
  // Hex → rgba con alpha 0.15 sin depender de helpers
  const r = parseInt(c.slice(1, 3), 16)
  const g = parseInt(c.slice(3, 5), 16)
  const b = parseInt(c.slice(5, 7), 16)
  return { bg: `rgba(${r},${g},${b},0.15)`, fg: c }
}

function ProgressBar({
  done, doing = 0, backlog, discarded = 0, height = 10,
}: { done: number; doing?: number; backlog: number; discarded?: number; height?: number }) {
  const total = done + doing + backlog + discarded || 1
  const pct = (n: number) => `${(n / total) * 100}%`
  return (
    <div
      className="rounded-md overflow-hidden flex"
      style={{
        height: `${height}px`,
        backgroundColor: 'var(--baw-bg)',
        border: '1px solid var(--baw-border)',
      }}
    >
      <div style={{ width: pct(done), backgroundColor: '#10b981' }} />
      <div style={{ width: pct(doing), backgroundColor: '#f59e0b' }} />
      <div style={{ width: pct(backlog), backgroundColor: '#6b7280' }} />
      <div style={{ width: pct(discarded), backgroundColor: '#ef4444', opacity: 0.4 }} />
    </div>
  )
}

export default async function RoadmapPage() {
  const ok = await isPlatformAdmin()
  if (!ok) redirect('/?forbidden=roadmap')

  const snap = ROADMAP_SNAPSHOT
  const t = snap.totals
  const donePct = Math.round((t.done / t.total) * 100)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1
          className="text-[24px] font-semibold mb-1 tracking-tight"
          style={{ color: 'var(--baw-text)' }}
        >
          BaW OS — Roadmap visual
        </h1>
        <p className="text-[12px]" style={{ color: 'var(--baw-muted)' }}>
          {snap.asOf} · v1 snapshot · v2 leerá Notion + GitHub en vivo
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { num: t.total, label: 'Features totales', color: 'var(--baw-text)' },
          { num: t.done, label: `Done · ${donePct}%`, color: '#10b981' },
          { num: t.doing, label: 'En desarrollo', color: '#f59e0b' },
          { num: t.backlog, label: 'Backlog', color: '#6b7280' },
        ].map((s, i) => (
          <div
            key={i}
            className="rounded-lg p-4"
            style={{
              backgroundColor: 'var(--baw-surface)',
              border: '1px solid var(--baw-border)',
            }}
          >
            <div className="text-[26px] font-bold tabular-nums" style={{ color: s.color }}>
              {s.num}
            </div>
            <div
              className="text-[11px] uppercase tracking-wider mt-1"
              style={{ color: 'var(--baw-muted)' }}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Global progress */}
      <div>
        <ProgressBar done={t.done} doing={t.doing} backlog={t.backlog} discarded={t.discarded} />
        <div className="flex flex-wrap gap-4 mt-2 text-[12px]" style={{ color: 'var(--baw-muted)' }}>
          <span><span style={{ color: '#10b981' }}>●</span> Done · {t.done}</span>
          <span><span style={{ color: '#f59e0b' }}>●</span> En desarrollo · {t.doing}</span>
          <span><span style={{ color: '#6b7280' }}>●</span> Backlog · {t.backlog}</span>
          <span><span style={{ color: '#ef4444', opacity: 0.6 }}>●</span> Descartado · {t.discarded}</span>
        </div>
      </div>

      {/* Sprint timeline */}
      <section>
        <h2
          className="text-[18px] font-semibold pb-2 mb-3"
          style={{ color: 'var(--baw-text)', borderBottom: '1px solid var(--baw-border)' }}
        >
          Sprints — lo recorrido y lo siguiente
        </h2>
        <div>
          {snap.sprints.map((sprint, i) => (
            <div
              key={i}
              className="grid gap-5 py-3"
              style={{
                gridTemplateColumns: '110px 1fr',
                borderBottom: i === snap.sprints.length - 1 ? 'none' : '1px solid var(--baw-border)',
              }}
            >
              <div>
                <div className="text-[14px] font-semibold mb-1" style={{ color: 'var(--baw-text)' }}>
                  {sprint.name}
                </div>
                <span
                  className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded inline-block"
                  style={{ backgroundColor: STATUS_BG[sprint.status], color: STATUS_FG[sprint.status] }}
                >
                  {sprint.statusLabel || sprint.status}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {sprint.items.map((it, j) => (
                  <span
                    key={j}
                    className="text-[12px] px-2.5 py-1 rounded-md"
                    style={{
                      backgroundColor: 'var(--baw-surface)',
                      border: '1px solid var(--baw-border)',
                      color: 'var(--baw-text)',
                    }}
                  >
                    <span style={{ color: 'var(--baw-muted)', fontWeight: 600, marginRight: 4 }}>
                      {it.num}
                    </span>
                    {it.text}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Kanban */}
      <section>
        <h2
          className="text-[18px] font-semibold pb-2 mb-3"
          style={{ color: 'var(--baw-text)', borderBottom: '1px solid var(--baw-border)' }}
        >
          Estado actual · Kanban abreviado
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {snap.kanban.map((col, i) => (
            <div
              key={i}
              className="rounded-lg p-3"
              style={{
                backgroundColor: 'var(--baw-surface)',
                border: '1px solid var(--baw-border)',
              }}
            >
              <div
                className="flex items-center justify-between pb-2 mb-2"
                style={{ borderBottom: '1px solid var(--baw-border)' }}
              >
                <h3 className="text-[14px] font-semibold" style={{ color: 'var(--baw-text)' }}>
                  {col.emoji} {col.name}
                </h3>
                <span
                  className="text-[11px] px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'var(--baw-bg)', color: 'var(--baw-muted)' }}
                >
                  {col.count}
                </span>
              </div>
              <div className="space-y-2">
                {col.cards.map((c, j) => {
                  const ts = tierStyle(c.tier)
                  return (
                    <div
                      key={j}
                      className="rounded-md p-2.5"
                      style={{
                        backgroundColor: 'var(--baw-bg)',
                        border: '1px solid var(--baw-border)',
                      }}
                    >
                      <div
                        className="text-[10px] uppercase tracking-wider font-semibold inline-block px-1.5 py-0.5 rounded mb-1"
                        style={{ backgroundColor: ts.bg, color: ts.fg }}
                      >
                        {c.tierLabel}
                      </div>
                      <div className="text-[13px]" style={{ color: 'var(--baw-text)' }}>
                        {c.text}
                      </div>
                    </div>
                  )
                })}
              </div>
              {col.footer && (
                <div
                  className="mt-2 p-2 rounded text-[12px]"
                  style={{
                    backgroundColor: 'var(--baw-bg)',
                    color: 'var(--baw-muted)',
                  }}
                >
                  {col.footer}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Tier breakdown */}
      <section>
        <h2
          className="text-[18px] font-semibold pb-2 mb-3"
          style={{ color: 'var(--baw-text)', borderBottom: '1px solid var(--baw-border)' }}
        >
          Desglose por Tier · qué falta
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {snap.tiers.map((tb, i) => (
            <div
              key={i}
              className="rounded-lg p-4"
              style={{
                backgroundColor: 'var(--baw-surface)',
                border: '1px solid var(--baw-border)',
                gridColumn: tb.fullWidth ? '1 / -1' : undefined,
              }}
            >
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="text-[14px] font-semibold" style={{ color: 'var(--baw-text)' }}>
                  {tb.name}
                </h3>
                <span className="text-[12px]" style={{ color: 'var(--baw-muted)' }}>
                  {tb.total} total · {tb.done} done
                  {tb.doing ? ` · ${tb.doing} en review` : ''}
                  {tb.backlog ? ` · ${tb.backlog} pending` : ''}
                  {tb.discarded ? ` · ${tb.discarded} descartados` : ''}
                </span>
              </div>
              <div className="mb-3">
                <ProgressBar
                  done={tb.done} doing={tb.doing || 0}
                  backlog={tb.backlog} discarded={tb.discarded || 0}
                  height={6}
                />
              </div>
              <ul
                className={tb.twoCols ? 'grid grid-cols-1 md:grid-cols-2 gap-x-5' : ''}
                style={{ listStyle: 'none' }}
              >
                {tb.items.map((it, j) => {
                  const isDone = it.status === 'done'
                  const isDoing = it.status === 'doing'
                  return (
                    <li
                      key={j}
                      className="text-[12.5px] py-1.5 relative pl-4"
                      style={{
                        color: isDone ? 'var(--baw-muted)' : 'var(--baw-text)',
                        textDecoration: isDone ? 'line-through' : 'none',
                        borderBottom: '1px dashed var(--baw-border)',
                      }}
                    >
                      <span
                        className="absolute left-0"
                        style={{
                          color: isDone ? '#10b981' : isDoing ? '#f59e0b' : 'var(--baw-muted)',
                        }}
                      >
                        {isDone ? '●' : isDoing ? '◐' : '○'}
                      </span>
                      {it.text}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Next up */}
      <div
        className="rounded-lg p-5"
        style={{
          background: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(168,85,247,0.05))',
          border: '1px solid rgba(245,158,11,0.3)',
        }}
      >
        <h3 className="text-[14px] font-semibold mb-3" style={{ color: '#f59e0b' }}>
          ⚡ Lo más urgente · candidatos a próximo sprint
        </h3>
        <ol className="ml-5 space-y-2 text-[13px]" style={{ color: 'var(--baw-text)' }}>
          {snap.nextUp.map((n, i) => (
            <li key={i} style={{ listStyle: 'decimal' }}>
              <strong>{n.id}</strong> · {n.text}.
              {n.reason && (
                <em style={{ color: 'var(--baw-muted)', marginLeft: 4 }}>{n.reason}</em>
              )}
            </li>
          ))}
        </ol>
      </div>

      {/* Footer */}
      <footer
        className="text-[11px] text-center pt-4"
        style={{ borderTop: '1px solid var(--baw-border)', color: 'var(--baw-muted)' }}
      >
        v1 snapshot · Datos: HTML mock 2026-05-01 · v2 (futuro): Notion Feature Board (100 features) + GitHub PRs/Issues + ISR 5min
      </footer>
    </div>
  )
}
