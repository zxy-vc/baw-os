import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * Anon client — for reading public views (v_public_buildings, v_public_units).
 * Has no write privileges. Safe to use for public GETs.
 */
export function createAnonClient(): SupabaseClient {
  return createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Service-role client — for writes (reservation_holds, reservations, etc.).
 * NEVER expose this client or its key to the browser/client side.
 * Only used in server-side API route handlers.
 */
export function createServiceClient(): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
