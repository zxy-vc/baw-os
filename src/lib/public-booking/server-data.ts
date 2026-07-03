/**
 * Fase 1 Public Listing — lecturas server-side de las vistas públicas.
 *
 * Las pages RSC del grupo `(public-booking)` leían la API pública con fetch
 * relativo (`/api/public/v1/...`), que en Node falla siempre ("Failed to
 * parse URL") y dejaba las páginas en fallbacks o 404. Server-side no hay
 * razón para pasar por HTTP: leemos las vistas `v_public_*` con el anon key,
 * que expone exactamente los mismos campos seguros que la API.
 *
 * El cliente HTTP (`public-booking-client/api-client.ts`) sigue siendo la vía
 * para componentes 'use client'.
 */

import { createAnonClient } from '@/lib/public-booking/supabase-public'
import type {
  PublicBuilding,
  PublicUnit,
  PublicUnitMediaItem,
} from '@/lib/public-booking/schemas'

export async function getPublicBuilding(slug: string): Promise<PublicBuilding | null> {
  try {
    const supabase = createAnonClient()
    const { data } = await supabase
      .from('v_public_buildings')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()
    return (data as PublicBuilding | null) ?? null
  } catch {
    return null
  }
}

export async function getPublicUnit(slug: string): Promise<PublicUnit | null> {
  try {
    const supabase = createAnonClient()
    const { data } = await supabase
      .from('v_public_units')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()
    if (!data) return null
    const gallery = await getPublicUnitGallery(supabase, data.id)
    return { ...(data as PublicUnit), gallery }
  } catch {
    return null
  }
}

export async function listPublicUnits(buildingSlug: string): Promise<PublicUnit[]> {
  try {
    const supabase = createAnonClient()
    const { data } = await supabase
      .from('v_public_units')
      .select('*')
      .eq('building_slug', buildingSlug)
    return (data as PublicUnit[] | null) ?? []
  } catch {
    return []
  }
}

export async function listPublicBuildings(): Promise<PublicBuilding[]> {
  try {
    const supabase = createAnonClient()
    const { data } = await supabase.from('v_public_buildings').select('*')
    return (data as PublicBuilding[] | null) ?? []
  } catch {
    return []
  }
}

async function getPublicUnitGallery(
  supabase: ReturnType<typeof createAnonClient>,
  unitId: string,
): Promise<PublicUnitMediaItem[]> {
  const { data } = await supabase
    .from('v_public_unit_media')
    .select('*')
    .eq('unit_id', unitId)
    .order('is_cover', { ascending: false })
    .order('sort_order', { ascending: true })
  return (data as PublicUnitMediaItem[] | null) ?? []
}
