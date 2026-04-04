'use client'

import Link from 'next/link'
import { type LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  actionLabel?: string
  actionHref?: string
}

export default function EmptyState({ icon: Icon, title, description, actionLabel, actionHref }: EmptyStateProps) {
  return (
    <div className="card text-center py-16">
      <div className="mx-auto w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-gray-400 dark:text-gray-600" />
      </div>
      <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">{title}</p>
      <p className="mt-1.5 text-sm text-gray-400 dark:text-gray-500 max-w-sm mx-auto">{description}</p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  )
}
