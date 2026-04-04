'use client'

export function SkeletonCard() {
  return (
    <div className="w-full h-24 rounded-xl animate-pulse bg-gray-200 dark:bg-gray-700" />
  )
}

export function SkeletonText({ width = 'w-full' }: { width?: string }) {
  return (
    <div className={`h-4 rounded animate-pulse bg-gray-200 dark:bg-gray-700 ${width}`} />
  )
}

export function SkeletonTable() {
  return (
    <div className="card overflow-hidden">
      {/* Header row */}
      <div className="flex gap-4 p-4 border-b border-gray-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800/50">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-4 flex-1 rounded animate-pulse bg-gray-300 dark:bg-gray-600" />
        ))}
      </div>
      {/* Data rows */}
      {Array.from({ length: 5 }).map((_, row) => (
        <div key={row} className="flex gap-4 p-4 border-b border-gray-100 dark:border-gray-800 last:border-0">
          {Array.from({ length: 4 }).map((_, col) => (
            <div key={col} className="h-4 flex-1 rounded animate-pulse bg-gray-200 dark:bg-gray-700" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonList() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card flex items-center gap-4">
          <div className="w-10 h-10 rounded-full animate-pulse bg-gray-200 dark:bg-gray-700 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 rounded animate-pulse bg-gray-200 dark:bg-gray-700 w-2/3" />
            <div className="h-3 rounded animate-pulse bg-gray-200 dark:bg-gray-700 w-1/2" />
          </div>
          <div className="h-6 w-16 rounded-full animate-pulse bg-gray-200 dark:bg-gray-700 shrink-0" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonDashboard() {
  return (
    <div className="space-y-6">
      {/* 4 stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 rounded-xl animate-pulse bg-gray-200 dark:bg-gray-700" />
        ))}
      </div>
      {/* Table */}
      <SkeletonTable />
    </div>
  )
}
