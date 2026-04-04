// BaW OS — Motor de Morosidad
// Detecta pagos vencidos no confirmados, calcula días de mora, niveles de escalamiento

export type MoraLevel = "grace" | "warning" | "critical" | "legal" | "abogado"

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
  if (daysPastDue <= 60) return "legal"
  return "abogado"
}

export function getMoraColor(level: MoraLevel): string {
  switch (level) {
    case "grace": return "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-700"
    case "warning": return "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-700"
    case "critical": return "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-700"
    case "legal": return "bg-red-100 text-red-900 border-red-300 dark:bg-red-900/30 dark:text-red-200 dark:border-red-600 font-bold"
    case "abogado": return "bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-900/30 dark:text-purple-200 dark:border-purple-600 font-bold"
  }
}

export function getMoraLabel(level: MoraLevel, days: number): string {
  switch (level) {
    case "grace": return `${days} días — en gracia`
    case "warning": return `${days} días de mora`
    case "critical": return `⚠️ ${days} días — mora crítica`
    case "legal": return `🚨 ${days} días — acción legal`
    case "abogado": return `⚖️ ${days} días — abogado`
  }
}

export function getMoraLevelOrder(level: MoraLevel): number {
  switch (level) {
    case "abogado": return 0
    case "legal": return 1
    case "critical": return 2
    case "warning": return 3
    case "grace": return 4
  }
}

export const moraLevelConfig: Record<MoraLevel, { label: string; range: string; description: string; action: string; actionLabel: string; cardColor: string }> = {
  grace: {
    label: 'Gracia',
    range: '1–5 días',
    description: 'Sin acción requerida',
    action: 'none',
    actionLabel: 'Sin acción',
    cardColor: 'border-l-4 border-l-gray-300 dark:border-l-gray-600',
  },
  warning: {
    label: 'Warning',
    range: '6–15 días',
    description: 'Notificación amigable',
    action: 'reminder',
    actionLabel: 'Enviar recordatorio',
    cardColor: 'border-l-4 border-l-orange-400',
  },
  critical: {
    label: 'Crítico',
    range: '16–30 días',
    description: 'Notificación formal + recargo 10%',
    action: 'formal',
    actionLabel: 'Enviar aviso formal',
    cardColor: 'border-l-4 border-l-red-500',
  },
  legal: {
    label: 'Legal',
    range: '31–60 días',
    description: 'Carta legal',
    action: 'legal_letter',
    actionLabel: 'Generar carta legal',
    cardColor: 'border-l-4 border-l-red-700',
  },
  abogado: {
    label: 'Abogado',
    range: '60+ días',
    description: 'Escalamiento a abogado',
    action: 'lawyer',
    actionLabel: 'Contactar abogado',
    cardColor: 'border-l-4 border-l-purple-600',
  },
}
