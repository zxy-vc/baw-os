// BaW OS — API Key Authentication for Agent Interface
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const ORG_ID = 'ed4308c7-2bdb-46f2-be69-7c59674838e2'

export function unauthorized(message = 'Unauthorized') {
  return NextResponse.json(
    { success: false, data: null, error: message },
    { status: 401 }
  )
}

export function apiError(message: string, status = 400) {
  return NextResponse.json(
    { success: false, data: null, error: message },
    { status }
  )
}

export function apiOk<T>(data: T) {
  return NextResponse.json({ success: true, data })
}

export function validateApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-api-key')
  const expected = process.env.BAWOS_API_KEY
  if (!expected) return false
  return apiKey === expected
}

export function getOrgId(): string {
  return ORG_ID
}
