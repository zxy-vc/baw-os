'use client'

// BaW OS — ProfileMenu (Sprint 3 / S4)
// Reemplaza el <div>MR</div> hardcoded en AppShell.
// Lee user_profiles para nombre/avatar; muestra menú con perfil, tema y logout.

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { User, LogOut, Settings, Sun, Moon, Monitor } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type ThemePref = 'light' | 'dark' | 'system'

interface UserBasics {
  id: string
  email: string | null
  full_name: string | null
  avatar_url: string | null
}

function getInitials(nameOrEmail: string | null): string {
  if (!nameOrEmail) return '·'
  const cleaned = nameOrEmail.trim()
  if (!cleaned) return '·'
  // Si es email, usar primera letra del local-part
  if (cleaned.includes('@')) {
    return cleaned[0].toUpperCase()
  }
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '·'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function ProfileMenu() {
  const router = useRouter()
  const [user, setUser] = useState<UserBasics | null>(null)
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState<ThemePref>('dark')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      const { data: sd } = await supabase.auth.getSession()
      const session = sd.session
      if (!session) {
        setUser(null)
        return
      }
      // Intentar leer user_profiles; si no existe, fallback al auth user
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('full_name, avatar_url')
        .eq('user_id', session.user.id)
        .maybeSingle()
      setUser({
        id: session.user.id,
        email: session.user.email ?? null,
        full_name: profile?.full_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
      })
    }
    load()

    // Tema inicial desde localStorage
    try {
      const t = localStorage.getItem('baw:theme') as ThemePref | null
      if (t === 'light' || t === 'dark' || t === 'system') {
        setTheme(t)
        applyTheme(t)
      }
    } catch {
      // ignore
    }

    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function applyTheme(t: ThemePref) {
    const root = document.documentElement
    if (t === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      root.classList.toggle('dark', prefersDark)
    } else {
      root.classList.toggle('dark', t === 'dark')
    }
  }

  function changeTheme(t: ThemePref) {
    setTheme(t)
    try {
      localStorage.setItem('baw:theme', t)
    } catch {
      // ignore
    }
    applyTheme(t)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const displayName = user?.full_name || user?.email || 'Cuenta'
  const initials = getInitials(user?.full_name || user?.email || null)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center justify-center w-8 h-8 rounded-full text-[12px] font-semibold overflow-hidden"
        style={{
          backgroundColor: 'rgba(59, 130, 246, 0.15)',
          color: '#60A5FA',
          border: '1px solid rgba(59, 130, 246, 0.3)',
        }}
        title={displayName}
        aria-label="Abrir menú de cuenta"
      >
        {user?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatar_url}
            alt={displayName}
            className="w-full h-full object-cover"
          />
        ) : (
          initials
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-60 rounded-md shadow-lg z-50 overflow-hidden"
          style={{
            backgroundColor: 'var(--baw-surface)',
            border: '1px solid var(--baw-border)',
          }}
        >
          {/* Header */}
          <div
            className="px-3 py-2.5"
            style={{ borderBottom: '1px solid var(--baw-border)' }}
          >
            <div
              className="text-[12px] font-medium truncate"
              style={{ color: 'var(--baw-text)' }}
            >
              {displayName}
            </div>
            {user?.email && user.email !== displayName && (
              <div
                className="text-[11px] truncate"
                style={{ color: 'var(--baw-muted)' }}
              >
                {user.email}
              </div>
            )}
          </div>

          {/* Items */}
          <ul>
            <li>
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-white/5"
                style={{ color: 'var(--baw-text)' }}
              >
                <User size={14} />
                Mi perfil
              </Link>
            </li>
            <li>
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-white/5"
                style={{ color: 'var(--baw-text)' }}
              >
                <Settings size={14} />
                Configuración
              </Link>
            </li>
          </ul>

          <div
            className="border-t"
            style={{ borderColor: 'var(--baw-border)' }}
          />

          {/* Theme picker */}
          <div className="px-3 py-2">
            <div
              className="text-[10px] uppercase tracking-wider mb-1.5"
              style={{ color: 'var(--baw-muted)' }}
            >
              Tema
            </div>
            <div className="flex gap-1">
              <ThemeButton
                active={theme === 'light'}
                onClick={() => changeTheme('light')}
                icon={<Sun size={13} />}
                label="Claro"
              />
              <ThemeButton
                active={theme === 'dark'}
                onClick={() => changeTheme('dark')}
                icon={<Moon size={13} />}
                label="Oscuro"
              />
              <ThemeButton
                active={theme === 'system'}
                onClick={() => changeTheme('system')}
                icon={<Monitor size={13} />}
                label="Auto"
              />
            </div>
          </div>

          <div
            className="border-t"
            style={{ borderColor: 'var(--baw-border)' }}
          />

          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-white/5"
            style={{ color: 'var(--baw-muted)' }}
          >
            <LogOut size={14} />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  )
}

function ThemeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md text-[10px]"
      style={{
        backgroundColor: active ? 'rgba(59,130,246,0.12)' : 'transparent',
        border: active
          ? '1px solid var(--baw-primary)'
          : '1px solid var(--baw-border)',
        color: active ? 'var(--baw-primary)' : 'var(--baw-muted)',
      }}
    >
      {icon}
      {label}
    </button>
  )
}
