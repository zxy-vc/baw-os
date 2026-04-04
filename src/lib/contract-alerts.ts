export type AlertLevel = "expired" | "critical" | "warning" | "info"

export interface ContractAlert {
  contractId: string
  unitId: string
  unitNumber: string
  tenantName: string
  endDate: string
  daysUntilExpiry: number
  level: AlertLevel
}

export function getAlertLevel(endDate: string | null | undefined): AlertLevel | null {
  if (!endDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const end = new Date(endDate)
  const diffDays = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return "expired"
  if (diffDays <= 15) return "critical"
  if (diffDays <= 30) return "warning"
  if (diffDays <= 60) return "info"
  return null
}

export function getAlertColor(level: AlertLevel): string {
  switch (level) {
    case "expired": return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-400"
    case "critical": return "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/10 dark:text-red-400"
    case "warning": return "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/10 dark:text-orange-400"
    case "info": return "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/10 dark:text-yellow-400"
  }
}

export function getAlertText(level: AlertLevel, daysUntilExpiry: number): string {
  if (level === "expired") return `Vencido hace ${Math.abs(daysUntilExpiry)} día(s)`
  if (level === "critical") return `Vence en ${daysUntilExpiry} día(s) ⚠️`
  if (level === "warning") return `Vence en ${daysUntilExpiry} días`
  return `Vence en ${daysUntilExpiry} días`
}
