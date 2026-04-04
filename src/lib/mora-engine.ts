// BaW OS — Motor de Morosidad
// Detecta pagos vencidos no confirmados, calcula días de mora, niveles de escalamiento

export type MoraLevel = "grace" | "warning" | "critical" | "legal"

export interface MoraStatus {
  contractId: string
  unitId: string
  unitNumber: string
  tenantName: string
  daysPastDue: number
  totalOverdue: number
  level: MoraLevel
  payments: { id: string; due_date: string; amount: number; days_late: number }[]
}

export function getMoraLevel(daysPastDue: number): MoraLevel {
  if (daysPastDue <= 5) return "grace"
  if (daysPastDue <= 15) return "warning"
  if (daysPastDue <= 30) return "critical"
  return "legal"
}

export function getMoraColor(level: MoraLevel): string {
  switch (level) {
    case "grace": return "bg-yellow-50 text-yellow-700 border-yellow-200"
    case "warning": return "bg-orange-50 text-orange-700 border-orange-200"
    case "critical": return "bg-red-50 text-red-700 border-red-200"
    case "legal": return "bg-red-100 text-red-900 border-red-300 font-bold"
  }
}

export function getMoraLabel(level: MoraLevel, days: number): string {
  switch (level) {
    case "grace": return `${days} días — en gracia`
    case "warning": return `${days} días de mora`
    case "critical": return `⚠️ ${days} días — mora crítica`
    case "legal": return `🚨 ${days} días — requiere acción legal`
  }
}

export function getMoraLevelOrder(level: MoraLevel): number {
  switch (level) {
    case "legal": return 0
    case "critical": return 1
    case "warning": return 2
    case "grace": return 3
  }
}
