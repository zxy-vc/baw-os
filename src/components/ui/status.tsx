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

const STATUS_MAP: Record<StatusKind, StatusStyle> = {
  suggested_by_agent: {
    label: 'Suggested',
    bg: 'transparent',
    color: '#A78BFA',
    border: 'rgba(139, 92, 246, 0.5)',
    outline: true,
  },
  pending_approval: {
    label: 'Pending Approval',
    bg: 'rgba(245, 158, 11, 0.15)',
    color: '#FBBF24',
    border: 'rgba(245, 158, 11, 0.3)',
  },
  approved: {
    label: 'Approved',
    bg: 'transparent',
    color: '#60A5FA',
    border: 'rgba(59, 130, 246, 0.5)',
    outline: true,
  },
  executing: {
    label: 'Executing',
    bg: 'rgba(59, 130, 246, 0.15)',
    color: '#60A5FA',
    border: 'rgba(59, 130, 246, 0.3)',
    pulse: true,
  },
  completed: {
    label: 'Completed',
    bg: 'rgba(34, 197, 94, 0.15)',
    color: '#4ADE80',
    border: 'rgba(34, 197, 94, 0.3)',
  },
  escalated: {
    label: 'Escalated',
    bg: 'rgba(249, 115, 22, 0.15)',
    color: '#FB923C',
    border: 'rgba(249, 115, 22, 0.3)',
  },
  blocked: {
    label: 'Blocked',
    bg: 'transparent',
    color: '#F87171',
    border: 'rgba(239, 68, 68, 0.5)',
    outline: true,
  },
  failed: {
    label: 'Failed',
    bg: 'rgba(239, 68, 68, 0.15)',
    color: '#F87171',
    border: 'rgba(239, 68, 68, 0.3)',
  },
  paid: {
    label: 'Paid',
    bg: 'rgba(34, 197, 94, 0.1)',
    color: '#4ADE80',
    border: 'rgba(34, 197, 94, 0.25)',
  },
  pending: {
    label: 'Pending',
    bg: 'rgba(245, 158, 11, 0.1)',
    color: '#FBBF24',
    border: 'rgba(245, 158, 11, 0.25)',
  },
  late: {
    label: 'Late',
    bg: 'rgba(239, 68, 68, 0.1)',
    color: '#F87171',
    border: 'rgba(239, 68, 68, 0.25)',
  },
  active: {
    label: 'Active',
    bg: 'rgba(34, 197, 94, 0.1)',
    color: '#4ADE80',
    border: 'rgba(34, 197, 94, 0.25)',
  },
  expired: {
    label: 'Expired',
    bg: 'rgba(139, 139, 149, 0.08)',
    color: '#8B8B95',
    border: 'rgba(139, 139, 149, 0.2)',
  },
  occupied: {
    label: 'Occupied',
    bg: 'rgba(59, 130, 246, 0.1)',
    color: '#60A5FA',
    border: 'rgba(59, 130, 246, 0.25)',
  },
  available: {
    label: 'Available',
    bg: 'rgba(34, 197, 94, 0.1)',
    color: '#4ADE80',
    border: 'rgba(34, 197, 94, 0.25)',
  },
  maintenance: {
    label: 'Maintenance',
    bg: 'rgba(245, 158, 11, 0.1)',
    color: '#FBBF24',
    border: 'rgba(245, 158, 11, 0.25)',
  },
  reserved: {
    label: 'Reserved',
    bg: 'rgba(139, 92, 246, 0.1)',
    color: '#A78BFA',
    border: 'rgba(139, 92, 246, 0.25)',
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
        backgroundColor: 'rgba(139, 92, 246, 0.12)',
        color: '#A78BFA',
        border: '1px solid rgba(139, 92, 246, 0.3)',
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
    color: '#F87171',
    bg: 'rgba(239, 68, 68, 0.15)',
    border: 'rgba(239, 68, 68, 0.35)',
  },
  high: {
    label: 'High',
    color: '#FB923C',
    bg: 'rgba(249, 115, 22, 0.15)',
    border: 'rgba(249, 115, 22, 0.3)',
  },
  medium: {
    label: 'Medium',
    color: '#FBBF24',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.25)',
  },
  low: {
    label: 'Low',
    color: '#8B8B95',
    bg: 'rgba(139, 139, 149, 0.1)',
    border: 'rgba(139, 139, 149, 0.25)',
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
  const color = pct >= 90 ? '#22C55E' : pct >= 70 ? '#F59E0B' : '#EF4444'
  return (
    <div className={cn('flex items-center gap-2 min-w-[80px]', className)}>
      <div
        className="flex-1 h-1.5 rounded-full overflow-hidden"
        style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)' }}
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
          backgroundColor: 'rgba(59, 130, 246, 0.15)',
          color: '#60A5FA',
          border: '1px solid rgba(59, 130, 246, 0.3)',
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
          backgroundColor: 'rgba(139, 92, 246, 0.15)',
          color: '#A78BFA',
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
        backgroundColor: 'rgba(139, 139, 149, 0.15)',
        color: '#8B8B95',
        border: '1px solid rgba(139, 139, 149, 0.3)',
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
  const deltaColor = deltaPositive ? '#4ADE80' : '#F87171'
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
            style={{ color: critical ? '#F87171' : '#FBBF24' }}
          />
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className="text-[24px] font-semibold leading-none tabular-nums"
          style={{
            color: accent === 'agent' ? '#A78BFA' : 'var(--baw-text)',
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
