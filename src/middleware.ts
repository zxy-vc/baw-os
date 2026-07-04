import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { DOMAIN_BUILDINGS, normalizeHost } from '@/lib/public-booking/domains'

// Auth protection stays in route/layout guards and AuthGuard.
// Middleware keeps Supabase SSR cookies fresh so Server Components
// (notably /admin L0 guard) can see the browser session after login,
// y además mapea dominios propios de edificio (809.mx) a sus rutas
// (public-booking) para servir la landing en la raíz del dominio.
export async function middleware(request: NextRequest) {
  // ── Dominio propio de edificio (Fase 1.5 PR B) ────────────────────────
  const host = normalizeHost(request.headers.get('host'))
  const buildingSlug = DOMAIN_BUILDINGS[host]
  if (buildingSlug) {
    const { pathname } = request.nextUrl
    const prefix = `/edificios/${buildingSlug}`

    // Canonicaliza: si alguien llega con la ruta larga en el dominio corto
    // (809.mx/edificios/mateos-809/unidades), redirige a la limpia (/unidades).
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      const url = request.nextUrl.clone()
      url.pathname = pathname.slice(prefix.length) || '/'
      return NextResponse.redirect(url, 308)
    }

    // API, assets y archivos SEO pasan tal cual; el resto se reescribe a la
    // ruta real del edificio. Rutas inexistentes bajo el edificio → 404.
    const passthrough =
      pathname.startsWith('/api/') ||
      pathname.startsWith('/_next/') ||
      pathname.startsWith('/themes/') ||
      pathname === '/robots.txt' ||
      pathname === '/sitemap.xml' ||
      pathname === '/favicon.ico'
    if (!passthrough) {
      const url = request.nextUrl.clone()
      url.pathname = pathname === '/' ? prefix : `${prefix}${pathname}`
      return NextResponse.rewrite(url)
    }
    // En dominio de edificio no hay sesión de plataforma que refrescar.
    return NextResponse.next({ request })
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(
          cookiesToSet: {
            name: string
            value: string
            options?: Record<string, unknown>
          }[],
        ) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value)
          })

          response = NextResponse.next({ request })

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(
              name,
              value,
              options as Parameters<typeof response.cookies.set>[2],
            )
          })
        },
      },
    },
  )

  // Required by @supabase/ssr to refresh auth cookies for Server Components.
  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
