'use client'

// BaW OS — Owner sign out — Sprint 4 / S4-2

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function OwnerSignOutButton() {
  const router = useRouter()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="flex items-center gap-1.5 text-[12px] px-2 py-1 rounded hover:bg-white/5"
      style={{ color: 'var(--baw-muted)' }}
    >
      <LogOut size={14} />
      Cerrar sesión
    </button>
  )
}
