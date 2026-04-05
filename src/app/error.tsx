'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Unhandled error:', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="text-center max-w-md">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Algo sali&oacute; mal
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">
          Ocurri&oacute; un error inesperado. Intenta de nuevo o recarga la p&aacute;gina.
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
        >
          Intentar de nuevo
        </button>
      </div>
    </div>
  )
}
