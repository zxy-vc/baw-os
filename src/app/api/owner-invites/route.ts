// BaW OS — Owner Invites API (Sprint 4 / S4-2)
//
// Permite a pm_owner / pm_admin crear invites para que un property_owner
// existente pueda loguearse al Owner Portal v2 con su email.

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/api-auth'
import { resolveOrgContext } from '@/lib/org-context'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const ctx = await resolveOrgContext()
    if (!['pm_owner', 'pm_admin'].includes(ctx.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const service = createServiceClient()
    const { data } = await service
      .from('owner_invites')
      .select(
        'id, email, status, sent_at, accepted_at, expires_at, property_owner_id, notes',
      )
      .eq('org_id', ctx.orgId)
      .order('sent_at', { ascending: false })

    return NextResponse.json({ invites: data ?? [] })
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await resolveOrgContext()
    if (!['pm_owner', 'pm_admin'].includes(ctx.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body.property_owner_id !== 'string') {
      return NextResponse.json(
        { error: 'property_owner_id required' },
        { status: 400 },
      )
    }

    const service = createServiceClient()

    // Verify property_owner belongs to this org
    const { data: po } = await service
      .from('property_owners')
      .select('id, email, full_name, org_id')
      .eq('id', body.property_owner_id)
      .maybeSingle()

    if (!po || po.org_id !== ctx.orgId) {
      return NextResponse.json({ error: 'Owner not found' }, { status: 404 })
    }

    const targetEmail = (body.email as string | undefined) || po.email
    if (!targetEmail) {
      return NextResponse.json(
        { error: 'No email available for this owner' },
        { status: 400 },
      )
    }

    const { data: invite, error } = await service
      .from('owner_invites')
      .insert({
        org_id: ctx.orgId,
        property_owner_id: po.id,
        email: targetEmail,
        invited_by: ctx.userId,
        notes: body.notes ?? null,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ invite })
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    )
  }
}
