'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

interface BreadcrumbItem {
  label: string
  href?: string
}

export default function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="flex items-center gap-1 text-sm text-gray-400 dark:text-gray-500 mb-4">
      {items.map((item, i) => {
        const isLast = i === items.length - 1
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-4 h-4" />}
            {isLast || !item.href ? (
              <span className={isLast ? 'font-semibold text-gray-700 dark:text-gray-200' : ''}>
                {item.label}
              </span>
            ) : (
              <Link href={item.href} className="hover:text-gray-600 dark:hover:text-gray-300">
                {item.label}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
