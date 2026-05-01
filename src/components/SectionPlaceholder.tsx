import type { LucideIcon } from 'lucide-react'
import { ArrowRight } from 'lucide-react'
import Link from 'next/link'

type Props = {
  icon: LucideIcon
  title: string
  description: string
  ctaHref?: string
  ctaLabel?: string
}

export default function SectionPlaceholder({
  icon: Icon,
  title,
  description,
  ctaHref,
  ctaLabel,
}: Props) {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="card p-8 md:p-10">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          <Icon className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-300">
          {description}
        </p>
        {ctaHref && ctaLabel && (
          <Link
            href={ctaHref}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            {ctaLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  )
}
