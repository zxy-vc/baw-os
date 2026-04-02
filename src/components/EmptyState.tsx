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
    <div className="card text-center py-12">
      <Icon className="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
      <p className="text-lg font-medium text-gray-500 dark:text-gray-400">{title}</p>
      <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">{description}</p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="mt-4 inline-block text-indigo-400 hover:text-indigo-300 text-sm font-medium"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  )
}
