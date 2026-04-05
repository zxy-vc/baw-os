import { NextResponse, type NextRequest } from 'next/server'

// Simplified middleware — auth protection handled client-side
// TODO: implement server-side auth once SSR cookie flow is resolved
export async function middleware(request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
