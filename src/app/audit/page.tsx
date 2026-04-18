'use client'

import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, ChevronLeft, ChevronRight, Search, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { SkeletonTable } from '@/components/Skeleton'
import { ActorAvatar, type ActorType } from '@/components/ui/status'

type ExtendedActorType = 'human' | 'agent' | 'system'

interface AuditEntry {
  id: string
  actor_type: ExtendedActorType
  actor_id: string
  action: string
  entity_type: string | null
  entity_id: string | null
  created_at: string
}

type TabFilter = 'all' | 'human' | 'agent' | 'system'
type TypeFilter = 'all' | 'approvals' | 'actions' | 'escalations' | 'records'

const PAGE_SIZE = 20

function classifyType(action: string): Exclude<TypeFilter, 'all'> {
  const a = action.toLowerCase()
  if (a.includes('approve') || a.includes('approval')) return 'approvals'
  if (a.includes('escalat')) return 'escalations'
  if (a.includes('update') || a.includes('create') || a.includes('delete') || a.includes('insert')) return 'records'
  return 'actions'
}

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const [tab, setTab] = useState<TabFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [actionSearch, setActionSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  async function fetchEntries() {
    setLoading(true)

    let query = supabase
      .from('audit_log')
      .select('id, actor_type, actor_id, action, entity_type, entity_id, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (tab === 'human' || tab === 'agent') {
      query = query.eq('actor_type', tab)
    }
    if (actionSearch.trim()) {
      query = query.ilike('action', `%${actionSearch.trim()}%`)
    }
    if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`)
    if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59`)

    const { data, count, error } = await query
    if (!error) {
      setEntries((data as AuditEntry[]) || [])
      setTotal(count || 0)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchEntries()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, tab, actionSearch, dateFrom, dateTo])

  useEffect(() => {
    setPage(0)
  }, [tab, typeFilter, actionSearch, dateFrom, dateTo])

  const filtered = useMemo(() => {
    let out = entries
    if (tab === 'system') out = out.filter((e) => (e.actor_type as string) === 'system')
    if (typeFilter !== 'all') out = out.filter((e) => classifyType(e.action) === typeFilter)
    return out
  }, [entries, tab, typeFilter])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  function toggle(id: string) {
    setExpanded((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: 'rgba(139, 92, 246, 0.12)' }}
        >
          <ClipboardList className="w-5 h-5" style={{ color: '#A78BFA' }} />
        </div>
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: 'var(--baw-text)' }}>
            Activity Timeline
          </h1>
          <p className="text-[13px] muted-text mt-0.5">Unified human + agent activity across the system</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {([
          ['all', 'All'],
          ['human', 'Humans'],
          ['agent', 'Agents'],
          ['system', 'System'],
        ] as [TabFilter, string][]).map(([key, label]) => {
          const active = tab === key
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors"
              style={{
                backgroundColor: active ? 'rgba(139, 92, 246, 0.15)' : 'var(--baw-surface)',
                color: active ? '#A78BFA' : 'var(--baw-muted)',
                border: `1px solid ${active ? 'rgba(139, 92, 246, 0.4)' : 'var(--baw-border)'}`,
              }}
            >
              {label}
            </button>
          )
        })}
        <div className="ml-auto flex flex-wrap gap-2">
          {([
            ['all', 'All Types'],
            ['approvals', 'Approvals'],
            ['actions', 'Actions'],
            ['escalations', 'Escalations'],
            ['records', 'Record Changes'],
          ] as [TypeFilter, string][]).map(([key, label]) => {
            const active = typeFilter === key
            return (
              <button
                key={key}
                onClick={() => setTypeFilter(key)}
                className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors"
                style={{
                  backgroundColor: active ? 'rgba(59, 130, 246, 0.15)' : 'var(--baw-surface)',
                  color: active ? '#60A5FA' : 'var(--baw-muted)',
                  border: `1px solid ${active ? 'rgba(59, 130, 246, 0.4)' : 'var(--baw-border)'}`,
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Filters */}
      <div
        className="rounded-lg p-3 grid grid-cols-1 sm:grid-cols-3 gap-3"
        style={{ backgroundColor: 'var(--baw-surface)', border: '1px solid var(--baw-border)' }}
      >
        <div>
          <label className="block text-[11px] font-medium muted-text mb-1 uppercase tracking-wide">Search</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--baw-muted)' }} />
            <input
              type="text"
              placeholder="Search actions..."
              value={actionSearch}
              onChange={(e) => setActionSearch(e.target.value)}
              className="input-field w-full pl-9"
            />
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-medium muted-text mb-1 uppercase tracking-wide">From</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input-field w-full" />
        </div>
        <div>
          <label className="block text-[11px] font-medium muted-text mb-1 uppercase tracking-wide">To</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input-field w-full" />
        </div>
      </div>

      {/* Timeline */}
      <div
        className="rounded-lg overflow-hidden"
        style={{ backgroundColor: 'var(--baw-surface)', border: '1px solid var(--baw-border)' }}
      >
        {loading ? (
          <div className="p-4">
            <SkeletonTable />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center muted-text">No activity entries match the current filters.</div>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--baw-border)' }}>
            {filtered.map((entry) => {
              const actorType: ActorType = entry.actor_type === 'agent' ? 'agent' : entry.actor_type === 'system' ? 'system' : 'human'
              const borderClass =
                actorType === 'agent' ? 'agent-border' : actorType === 'human' ? 'human-border' : ''
              const isExpanded = expanded.has(entry.id)
              return (
                <li
                  key={entry.id}
                  className={`px-4 py-3 flex items-start gap-3 ${borderClass}`}
                  style={{ borderBottomColor: 'var(--baw-border)' }}
                >
                  <ActorAvatar type={actorType} name={entry.actor_id} size={26} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-medium" style={{ color: 'var(--baw-text)' }}>
                        {entry.actor_id}
                      </span>
                      <span
                        className="text-[11px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide"
                        style={{
                          backgroundColor:
                            actorType === 'agent'
                              ? 'rgba(139, 92, 246, 0.12)'
                              : actorType === 'system'
                              ? 'rgba(139, 139, 149, 0.12)'
                              : 'rgba(59, 130, 246, 0.12)',
                          color: actorType === 'agent' ? '#A78BFA' : actorType === 'system' ? '#8B8B95' : '#60A5FA',
                        }}
                      >
                        {actorType}
                      </span>
                      <span className="text-[11px] muted-text ml-auto tabular-nums whitespace-nowrap">
                        {new Date(entry.created_at).toLocaleString('es-MX', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-[13px] mt-0.5 leading-snug" style={{ color: 'var(--baw-text)' }}>
                      {entry.action}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-[11px] muted-text">
                      <span>{entry.entity_type || '—'}</span>
                      {entry.entity_id && (
                        <span className="font-mono tabular-nums">{entry.entity_id.slice(0, 8)}…</span>
                      )}
                      <button
                        onClick={() => toggle(entry.id)}
                        className="ml-auto inline-flex items-center gap-1"
                        style={{ color: 'var(--baw-primary)' }}
                      >
                        {isExpanded ? (
                          <>
                            Collapse <ChevronUp className="w-3 h-3" />
                          </>
                        ) : (
                          <>
                            Details <ChevronDown className="w-3 h-3" />
                          </>
                        )}
                      </button>
                    </div>
                    {isExpanded && (
                      <div
                        className="mt-2 text-[12px] leading-relaxed p-2 rounded"
                        style={{
                          color: 'var(--baw-muted)',
                          backgroundColor: actorType === 'agent' ? 'rgba(139, 92, 246, 0.06)' : 'rgba(255, 255, 255, 0.03)',
                          border: `1px solid ${actorType === 'agent' ? 'rgba(139, 92, 246, 0.18)' : 'var(--baw-border)'}`,
                        }}
                      >
                        {actorType === 'agent' ? (
                          <>
                            <span style={{ color: '#A78BFA' }}>Reasoning: </span>
                            Action executed under supervised autonomy. Related entity {entry.entity_type || 'n/a'}
                            {entry.entity_id ? ` (${entry.entity_id.slice(0, 8)}…)` : ''}. Full trace available in agent log.
                          </>
                        ) : (
                          <>
                            <span className="font-medium" style={{ color: 'var(--baw-text)' }}>Context: </span>
                            Entity: {entry.entity_type || 'n/a'}
                            {entry.entity_id ? ` · ${entry.entity_id}` : ''}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {totalPages > 1 && (
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderTop: '1px solid var(--baw-border)' }}
          >
            <p className="text-[11px] muted-text tabular-nums">
              {total} entries · Page {page + 1} of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ color: 'var(--baw-muted)' }}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ color: 'var(--baw-muted)' }}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
