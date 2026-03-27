import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Parameters<typeof supabaseResponse.cookies.set>[2])
          )
        },
      },
    }
  )

  // IMPORTANT: must call getUser() to refresh session cookies
  const { data: { user } } = await supabase.auth.getUser()

  const isLoginPage = request.nextUrl.pathname.startsWith('/login')
  const isPublicPath = isLoginPage ||
    request.nextUrl.pathname.startsWith('/api/auth') ||
    request.nextUrl.pathname === '/favicon.ico'

  // Redirect unauthenticated users to /login
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    const redirectResponse = NextResponse.redirect(url)
    // Copy cookies from supabaseResponse to redirect response
    supabaseResponse.cookies.getAll().forEach(cookie => {
      redirectResponse.cookies.set(cookie.name, cookie.value)
    })
    return redirectResponse
  }

  // Redirect authenticated users away from /login
  if (user && isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    const redirectResponse = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach(cookie => {
      redirectResponse.cookies.set(cookie.name, cookie.value)
    })
    return redirectResponse
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
