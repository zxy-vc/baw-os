import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Server client for server components and server actions (reads cookies)
export function createSupabaseServer() {
  const cookieStore = cookies()
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // setAll called from Server Component — ignored (handled by middleware)
        }
      },
    },
  })
}

// Variante para Route Handlers detrás del middleware. Lee las cookies del propio
// request (que el middleware ya refrescó), en vez de next/headers cookies(), que
// en route handlers no siempre refleja ese refresh. Evita el Unauthorized por la
// carrera de rotación de refresh-token cuando el access token expira.
export function createSupabaseServerFromRequest(request: NextRequest) {
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      // No persistimos cookies aquí: el middleware ya hizo el refresh.
      setAll() {},
    },
  })
}
