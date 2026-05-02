'use client'

import { Bot, Settings2, ArrowUp, ArrowDown, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

/* -------------------------- StatusBadge -------------------------- */

export type StatusKind =
  | 'suggested_by_agent'
  | 'pending_approval'
  | 'approved'
  | 'executing'
  | 'completed'
  | 'escalated'
  | 'blocked'
  | 'failed'
  | 'paid'
  | 'pending'
  | 'late'
  | 'active'
  | 'expired'
  | 'occupied'
  | 'available'
  | 'maintenance'
  | 'reserved'

type StatusStyle = {
  label: string
  bg: string
  color: string
  border: string
  pulse?: boolean
  outline?: boolean
}

// Sprint 5 / fix #24: HEX/rgba migrados a tokens var(--baw-*) definidos en globals.css.
// Mantiene paleta visual idéntica al diseño Sprint 3 pero centraliza para theming tenant futuro.
const STATUS_MAP: Record<StatusKind, StatusStyle> = {
  suggested_by_agent: {
    label: 'Suggested',
    bg: 'transparent',
    color: 'var(--baw-agent-fg)',
    border: 'var(--baw-agent-border-strong)',
    outline: true,
  },
  pending_approval: {
    label: 'Pending Approval',
    bg: 'var(--baw-warning-bg-2)',
    color: 'var(--baw-warning-fg)',
    border: 'var(--baw-warning-border)',
  },
  approved: {
    label: 'Approved',
    bg: 'transparent',
    color: 'var(--baw-info-fg)',
    border: 'var(--baw-info-border-strong)',
    outline: true,
  },
  executing: {
    label: 'Executing',
    bg: 'var(--baw-info-bg-2)',
    color: 'var(--baw-info-fg)',
    border: 'var(--baw-info-border)',
    pulse: true,
  },
  completed: {
    label: 'Completed',
    bg: 'var(--baw-success-bg-2)',
    color: 'var(--baw-success-fg)',
    border: 'var(--baw-success-border)',
  },
  escalated: {
    label: 'Escalated',
    bg: 'var(--baw-orange-bg)',
    color: 'var(--baw-orange-fg)',
    border: 'var(--baw-orange-border)',
  },
  blocked: {
    label: 'Blocked',
    bg: 'transparent',
    color: 'var(--baw-danger-fg)',
    border: 'rgba(239, 68, 68, 0.50)',
    outline: true,
  },
  failed: {
    label: 'Failed',
    bg: 'var(--baw-danger-bg-2)',
    color: 'var(--baw-danger-fg)',
    border: 'var(--baw-danger-border)',
  },
  paid: {
    label: 'Paid',
    bg: 'var(--baw-success-bg-soft)',
    color: 'var(--baw-success-fg)',
    border: 'var(--baw-success-border-soft)',
  },
  pending: {
    label: 'Pending',
    bg: 'var(--baw-warning-bg-soft)',
    color: 'var(--baw-warning-fg)',
    border: 'var(--baw-warning-border-soft)',
  },
  late: {
    label: 'Late',
    bg: 'var(--baw-danger-bg-soft)',
    color: 'var(--baw-danger-fg)',
    border: 'var(--baw-danger-border-soft)',
  },
  active: {
    label: 'Active',
    bg: 'var(--baw-success-bg-soft)',
    color: 'var(--baw-success-fg)',
    border: 'var(--baw-success-border-soft)',
  },
  expired: {
    label: 'Expired',
    bg: 'var(--baw-neutral-bg-soft)',
    color: 'var(--baw-neutral-fg)',
    border: 'var(--baw-neutral-border-soft)',
  },
  occupied: {
    label: 'Occupied',
    bg: 'var(--baw-info-bg-soft)',
    color: 'var(--baw-info-fg)',
    border: 'var(--baw-info-border-soft)',
  },
  available: {
    label: 'Available',
    bg: 'var(--baw-success-bg-soft)',
    color: 'var(--baw-success-fg)',
    border: 'var(--baw-success-border-soft)',
  },
  maintenance: {
    label: 'Maintenance',
    bg: 'var(--baw-warning-bg-soft)',
    color: 'var(--baw-warning-fg)',
    border: 'var(--baw-warning-border-soft)',
  },
  reserved: {
    label: 'Reserved',
    bg: 'var(--baw-agent-bg-soft)',
    color: 'var(--baw-agent-fg)',
    border: 'var(--baw-agent-border-soft)',
  },
}

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: StatusKind
  label?: string
  className?: string
}) {
  const style = STATUS_MAP[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium',
        style.pulse && 'animate-pulse-soft',
        className
      )}
      style={{
        backgroundColor: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
      }}
    >
      {style.pulse && (
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: style.color }}
        />
      )}
      {label || style.label}
    </span>
  )
}

/* -------------------------- AgentBadge -------------------------- */

export function AgentBadge({
  label = 'Agent',
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium',
        className
      )}
      style={{
        backgroundColor: 'var(--baw-agent-bg)',
        color: 'var(--baw-agent-fg)',
        border: '1px solid var(--baw-agent-border)',
      }}
    >
      <Bot className="w-3 h-3" />
      {label}
    </span>
  )
}

/* -------------------------- PriorityBadge -------------------------- */

export type Priority = 'critical' | 'high' | 'medium' | 'low'

const PRIORITY_MAP: Record<Priority, { label: string; color: string; bg: string; border: string }> = {
  critical: {
    label: 'Critical',
    color: 'var(--baw-danger-fg)',
    bg: 'var(--baw-danger-bg-2)',
    border: 'rgba(239, 68, 68, 0.35)',
  },
  high: {
    label: 'High',
    color: 'var(--baw-orange-fg)',
    bg: 'var(--baw-orange-bg)',
    border: 'var(--baw-orange-border)',
  },
  medium: {
    label: 'Medium',
    color: 'var(--baw-warning-fg)',
    bg: 'var(--baw-warning-bg)',
    border: 'var(--baw-warning-border-soft)',
  },
  low: {
    label: 'Low',
    color: 'var(--baw-neutral-fg)',
    bg: 'var(--baw-neutral-bg)',
    border: 'var(--baw-neutral-border)',
  },
}

export function PriorityBadge({
  priority,
  className,
}: {
  priority: Priority
  className?: string
}) {
  const style = PRIORITY_MAP[priority]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium uppercase tracking-wide',
        className
      )}
      style={{
        backgroundColor: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
      }}
    >
      {style.label}
    </span>
  )
}

/* -------------------------- ConfidenceBar -------------------------- */

export function ConfidenceBar({
  value,
  className,
  showLabel = true,
}: {
  value: number // 0-100
  className?: string
  showLabel?: boolean
}) {
  const pct = Math.max(0, Math.min(100, value))
  const color =
    pct >= 90
      ? 'var(--baw-success)'
      : pct >= 70
      ? 'var(--baw-warning)'
      : 'var(--baw-danger)'
  return (
    <div className={cn('flex items-center gap-2 min-w-[80px]', className)}>
      <div
        className="flex-1 h-1.5 rounded-full overflow-hidden"
        style={{ backgroundColor: 'var(--baw-overlay-on-dark)' }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      {showLabel && (
        <span
          className="text-[11px] font-medium tabular-nums"
          style={{ color }}
        >
          {pct}%
        </span>
      )}
    </div>
  )
}

/* -------------------------- ActorAvatar -------------------------- */

export type ActorType = 'human' | 'agent' | 'system'

export function ActorAvatar({
  type,
  name,
  size = 28,
  className,
}: {
  type: ActorType
  name?: string
  size?: number
  className?: string
}) {
  const initials = (name || '?')
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const dim = { width: size, height: size, fontSize: Math.round(size * 0.4) }

  if (type === 'human') {
    return (
      <div
        className={cn('inline-flex items-center justify-center rounded-full font-semibold', className)}
        style={{
          ...dim,
          backgroundColor: 'var(--baw-info-bg-2)',
          color: 'var(--baw-info-fg)',
          border: '1px solid var(--baw-info-border)',
        }}
      >
        {initials}
      </div>
    )
  }

  if (type === 'agent') {
    return (
      <div
        className={cn('inline-flex items-center justify-center rounded-md font-semibold', className)}
        style={{
          ...dim,
          backgroundColor: 'var(--baw-agent-bg-2)',
          color: 'var(--baw-agent-fg)',
          border: '1px solid rgba(139, 92, 246, 0.35)',
        }}
      >
        <svg
          viewBox="0 0 16 16"
          width={Math.round(size * 0.55)}
          height={Math.round(size * 0.55)}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <polygon points="8,2 14,6 14,12 8,15 2,12 2,6" />
          <circle cx="8" cy="9" r="2" fill="currentColor" stroke="none" />
        </svg>
      </div>
    )
  }

  // system
  return (
    <div
      className={cn('inline-flex items-center justify-center rounded-md', className)}
      style={{
        ...dim,
        backgroundColor: 'var(--baw-neutral-bg-2, rgba(139, 139, 149, 0.15))',
        color: 'var(--baw-neutral-fg)',
        border: '1px solid var(--baw-neutral-border)',
      }}
    >
      <Settings2 style={{ width: size * 0.5, height: size * 0.5 }} />
    </div>
  )
}

/* -------------------------- KPICard -------------------------- */

export function KPICard({
  label,
  value,
  delta,
  deltaLabel,
  warning,
  critical,
  accent,
  children,
  className,
}: {
  label: string
  value: string | number
  delta?: number
  deltaLabel?: string
  warning?: boolean
  critical?: boolean
  accent?: 'agent' | 'primary'
  children?: React.ReactNode
  className?: string
}) {
  const borderColor = critical
    ? 'rgba(239, 68, 68, 0.5)'
    : warning
    ? 'rgba(245, 158, 11, 0.5)'
    : accent === 'agent'
    ? 'rgba(139, 92, 246, 0.35)'
    : 'var(--baw-border)'

  const deltaPositive = (delta ?? 0) >= 0
  const deltaColor = deltaPositive ? 'var(--baw-success-fg)' : 'var(--baw-danger-fg)'
  const DeltaIcon = deltaPositive ? ArrowUp : ArrowDown

  return (
    <div
      className={cn('rounded-lg p-4 flex flex-col gap-2', className)}
      style={{
        backgroundColor: 'var(--baw-surface)',
        border: `1px solid ${borderColor}`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide font-medium muted-text">
          {label}
        </span>
        {(warning || critical) && (
          <AlertTriangle
            className="w-3.5 h-3.5"
            style={{ color: critical ? 'var(--baw-danger-fg)' : 'var(--baw-warning-fg)' }}
          />
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className="text-[24px] font-semibold leading-none tabular-nums"
          style={{
            color: accent === 'agent' ? 'var(--baw-agent-fg)' : 'var(--baw-text)',
          }}
        >
          {value}
        </span>
        {typeof delta === 'number' && (
          <span
            className="inline-flex items-center text-[11px] font-medium tabular-nums"
            style={{ color: deltaColor }}
          >
            <DeltaIcon className="w-3 h-3" />
            {Math.abs(delta)}%
            {deltaLabel && <span className="muted-text ml-1">{deltaLabel}</span>}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}
