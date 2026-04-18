'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light'

const ThemeContext = createContext<{
  theme: Theme
  toggleTheme: () => void
}>({ theme: 'dark', toggleTheme: () => {} })

export function useTheme() {
  return useContext(ThemeContext)
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // Default to dark; only honor explicit 'light' override
    const stored = (typeof window !== 'undefined'
      ? (localStorage.getItem('baw-theme') as Theme | null)
      : null)
    const initial: Theme = stored === 'light' ? 'light' : 'dark'
    setTheme(initial)
    document.documentElement.classList.toggle('dark', initial === 'dark')
    document.documentElement.classList.toggle('light', initial === 'light')
    setMounted(true)
  }, [])

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    try {
      localStorage.setItem('baw-theme', next)
    } catch {}
    document.documentElement.classList.toggle('dark', next === 'dark')
    document.documentElement.classList.toggle('light', next === 'light')
  }

  if (!mounted) {
    return <>{children}</>
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
