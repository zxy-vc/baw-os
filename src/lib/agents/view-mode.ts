// BaW OS — View Mode helper (Human ↔ Agent)
// Persiste preferencia en org_members.preferred_view_mode.
// Lectura cliente: useViewMode hook (en componente .tsx aparte).
// Lectura servidor: getViewMode() para SSR.

import { createServiceClient } from '@/lib/supabase'
import { createSupabaseServer } from '@/lib/supabase-server'
import { resolveOrgId } from '@/lib/org-context'

export type ViewMode = 'human' | 'agent'
export const DEFAULT_VIEW_MODE: ViewMode = 'human'

export async function getViewMode(): Promise<ViewMode> {
  try {
    const supabase = createSupabaseServer()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return DEFAULT_VIEW_MODE

    const orgId = await resolveOrgId()
    const service = createServiceClient()
    const { data } = await service
      .from('org_members')
      .select('preferred_view_mode')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .maybeSingle()

    const mode = (data?.preferred_view_mode as ViewMode) || DEFAULT_VIEW_MODE
    return mode === 'agent' ? 'agent' : 'human'
  } catch {
    return DEFAULT_VIEW_MODE
  }
}

export async function setViewMode(mode: ViewMode): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = createSupabaseServer()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'No authenticated user' }

    const orgId = await resolveOrgId()
    const service = createServiceClient()
    const { error } = await service
      .from('org_members')
      .update({ preferred_view_mode: mode })
      .eq('user_id', user.id)
      .eq('org_id', orgId)

    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' }
  }
}
