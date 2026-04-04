'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { getAlertColor, getAlertText, type ContractAlert } from '@/lib/contract-alerts'
import { formatDate } from '@/lib/utils'

export default function ContractAlertsBanner({ className }: { className?: string }) {
  const [alerts, setAlerts] = useState<ContractAlert[]>([])
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    fetch('/api/contracts/alerts')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setAlerts(data)
      })
      .catch(() => {})
  }, [])

  if (alerts.length === 0) return null

  const visible = expanded ? alerts : alerts.slice(0, 3)
  const remaining = alerts.length - 3

  return (
    <div className={`card border-amber-500/30 ${className || ''}`}>
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-5 h-5 text-amber-500" />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Contratos próximos a vencer
        </h3>
        <span className="text-xs bg-amber-500/15 text-amber-500 px-2 py-0.5 rounded-full font-medium">
          {alerts.length}
        </span>
      </div>
      <div className="space-y-2">
        {visible.map((alert) => (
          <Link
            key={alert.contractId}
            href={`/contracts/${alert.contractId}`}
            className={`flex items-center justify-between gap-3 p-2.5 rounded-lg border transition-colors hover:opacity-80 ${getAlertColor(alert.level)}`}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{alert.tenantName}</p>
              <p className="text-xs opacity-75">
                Unidad {alert.unitNumber} · {formatDate(alert.endDate)}
              </p>
            </div>
            <span className="text-xs font-semibold whitespace-nowrap">
              {getAlertText(alert.level, alert.daysUntilExpiry)}
            </span>
          </Link>
        ))}
      </div>
      {remaining > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 mt-2 text-xs text-amber-600 dark:text-amber-400 hover:underline font-medium"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              Mostrar menos
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              Ver {remaining} más
            </>
          )}
        </button>
      )}
    </div>
  )
}
