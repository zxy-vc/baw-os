'use client'

import { useEffect, useMemo, useState } from 'react'
import { Building2, Save, Settings2, Shield, User } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useOrgContext } from '@/hooks/useOrgContext'
import { useActiveContext } from '@/lib/useActiveContext'
import { ORG_ADMIN_ROLES } from '@/lib/navigation'
import type { MemberRole, OrgMember, Organization, UserProfile } from '@/types'

const roleOptions: MemberRole[] = ['pm_owner', 'pm_admin', 'pm_operator', 'pm_viewer']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function SettingsPage() {
  const [tab, setTab] = useState<'profile' | 'organization' | 'access'>('profile')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<Partial<UserProfile>>({})
  const [organization, setOrganization] = useState<Partial<Organization>>({})
  const [members, setMembers] = useState<OrgMember[]>([])
  const [newMember, setNewMember] = useState({ invited_email: '', role: 'pm_operator' as MemberRole })
  const [message, setMessage] = useState<string | null>(null)

  const { orgId, role, loading: orgLoading } = useOrgContext()
  // Fallback de org: si el contexto de SERVIDOR no resuelve la org (p. ej. la
  // sesión no llega al server en prod, o falta la fila en org_members vista por
  // el server), usamos el contexto del NAVEGADOR — el mismo que /onboarding usa
  // con éxito. Así /settings nunca queda sin org si el browser sí la tiene.
  const { activeOrgId, loading: actLoading } = useActiveContext()
  const effectiveOrgId = orgId ?? activeOrgId
  // El rol puede venir del server o, si falta, de la membresía ya cargada.
  const effectiveRole = role ?? members.find((m) => m.user_id === userId)?.role ?? null
  const isOrgAdmin = !!effectiveRole && ORG_ADMIN_ROLES.includes(effectiveRole as MemberRole)

  async function load(activeOrgId: string) {
    setLoading(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const sessionUser = sessionData.session?.user || null
      setUserId(sessionUser?.id || null)

      // Sprint 6 followup fix: usar .maybeSingle() en lugar de .single() para
      // organizations — si por alguna razón el row no existe (org id stale,
      // RLS niega, etc.) `.single()` rechaza con PGRST116 y deja al usuario
      // atorado en "Cargando configuración…" para siempre. Con maybeSingle
      // recibimos `{data: null}` y caemos a la rama vacía en línea de abajo.
      //
      // Además envolvemos todo en try/finally: aunque supabase-js no rechaza
      // por errores de query, otras causas (timeout de red, fallo en
      // getSession, etc.) sí pueden lanzar. Sin esto, setLoading(false) nunca
      // se ejecuta y el spinner queda eterno (bug pattern conocido en BaW OS).
      const [profileRes, orgRes, membersRes] = await Promise.all([
        sessionUser?.id
          ? supabase.from('user_profiles').select('*').eq('id', sessionUser.id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('organizations').select('*').eq('id', activeOrgId).maybeSingle(),
        supabase.from('org_members').select('*').eq('org_id', activeOrgId).order('created_at'),
      ])

      setProfile({
        id: sessionUser?.id,
        full_name: profileRes.data?.full_name || sessionUser?.user_metadata?.full_name || '',
        phone: profileRes.data?.phone || '',
        job_title: profileRes.data?.job_title || '',
        avatar_url: profileRes.data?.avatar_url || '',
      })
      setOrganization(orgRes.data || {})
      setMembers((membersRes.data || []) as OrgMember[])
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Settings: error cargando configuración', err)
      setMessage(err instanceof Error ? `Error: ${err.message}` : 'Error cargando configuración')
    } finally {
      setLoading(false)
    }
  }

  // Sprint 6 followup #2 fix: el bug real de "Cargando configuración…" no era
  // Promise.all rechazando — era que `useOrgContext` puede resolverse con
  // `orgId === null` (sin org activa, /api/me/org devolvió 401/403, o el
  // usuario no tiene memberships todavía). En ese caso `load()` JAMÁS se
  // llamaba, `loading` quedaba en su default `true` para siempre, y el
  // spinner se quedaba eterno aunque `orgLoading` ya hubiera terminado.
  //
  // Fix: cuando orgLoading termina, decidimos:
  //   - hay orgId  → load(orgId) (igual que antes)
  //   - no hay orgId → setLoading(false) para que renderice el mensaje
  //     vacío de la línea ~135 en lugar del spinner.
  useEffect(() => {
    if (orgLoading || actLoading) return
    const eff = orgId ?? activeOrgId
    if (eff) {
      load(eff)
    } else {
      setLoading(false)
    }
  }, [orgLoading, actLoading, orgId, activeOrgId])

  async function saveProfile() {
    if (!userId) return
    setSaving(true)
    setMessage(null)
    const payload = {
      id: userId,
      full_name: profile.full_name || null,
      phone: profile.phone || null,
      job_title: profile.job_title || null,
      avatar_url: profile.avatar_url || null,
    }
    const { error } = await supabase.from('user_profiles').upsert(payload)
    setSaving(false)
    setMessage(error ? `Error: ${error.message}` : 'Perfil guardado')
  }

  async function saveOrganization() {
    if (!effectiveOrgId) return
    setSaving(true)
    setMessage(null)
    const payload = {
      name: organization.name || null,
      slug: organization.slug || null,
      logo_url: organization.logo_url || null,
      phone: organization.phone || null,
      email: organization.email || null,
      address: organization.address || null,
      city: organization.city || null,
    }
    const { error } = await supabase.from('organizations').update(payload).eq('id', effectiveOrgId)
    setSaving(false)
    setMessage(error ? `Error: ${error.message}` : 'Organización guardada')
  }

  async function updateMember(memberId: string, fields: Partial<OrgMember>) {
    setMembers((current) => current.map((m) => m.id === memberId ? { ...m, ...fields } : m))
    await supabase.from('org_members').update(fields).eq('id', memberId)
  }

  async function addMemberPlaceholder() {
    const email = newMember.invited_email.trim()
    if (!effectiveOrgId) return
    if (!EMAIL_RE.test(email)) {
      setMessage('Ingresa un email válido para invitar.')
      return
    }
    setSaving(true)
    setMessage(null)
    const payload = {
      org_id: effectiveOrgId,
      user_id: crypto.randomUUID(),
      invited_email: email,
      role: newMember.role,
      is_active: true,
    }
    const { data, error } = await supabase.from('org_members').insert(payload).select('*').single()
    if (!error && data) {
      setMembers((current) => [...current, data as OrgMember])
      setNewMember({ invited_email: '', role: 'pm_operator' })
      setMessage('Acceso pre-registrado. El usuario quedará activo al iniciar sesión con ese email (invitación por correo: pendiente).')
    } else {
      setMessage(error ? `Error: ${error.message}` : 'No se pudo agregar miembro')
    }
    setSaving(false)
  }

  // Operadores/viewers solo ven su perfil; la config de organización y los
  // accesos son de admins. (La RLS también lo bloquea a nivel de datos.)
  const tabs = useMemo(() => {
    const base = [{ key: 'profile', label: 'Perfil', icon: User }] as const
    const adminTabs = [
      { key: 'organization', label: 'Organización', icon: Building2 },
      { key: 'access', label: 'Accesos', icon: Shield },
    ] as const
    return isOrgAdmin ? [...base, ...adminTabs] : base
  }, [isOrgAdmin])

  // Si un no-admin tenía seleccionada una pestaña restringida, regrésalo a Perfil.
  useEffect(() => {
    if (!isOrgAdmin && tab !== 'profile') setTab('profile')
  }, [isOrgAdmin, tab])

  if (orgLoading || actLoading || loading) return <div className="text-sm page-subtitle">Cargando configuración…</div>
  if (!effectiveOrgId) {
    return (
      <div className="max-w-2xl space-y-3">
        <h1 className="text-2xl font-bold page-title">Configuración</h1>
        <div className="card p-5 space-y-2">
          <p className="text-sm page-subtitle">
            No encontramos una organización activa para tu cuenta.
          </p>
          <p className="text-xs page-subtitle">
            Esto suele pasar si tu sesión expiró o si todavía no completaste
            el onboarding inicial. Intenta cerrar sesión y entrar de nuevo,
            o configura tu cuenta desde el wizard.
          </p>
          <div className="flex gap-2 pt-2">
            <a href="/onboarding" className="btn-primary text-xs">Configurar cuenta</a>
            <a href="/login" className="btn-secondary text-xs">Cerrar sesión</a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Settings2 className="w-6 h-6 text-gray-500 dark:text-gray-400" />
        <div>
          <h1 className="text-2xl font-bold page-title">Settings</h1>
          <p className="text-sm page-subtitle">MVP administrativo para identidad, organización y accesos.</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {tabs.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={tab === item.key ? 'btn-primary flex items-center gap-2' : 'btn-secondary flex items-center gap-2'}
          >
            <item.icon className="w-4 h-4" /> {item.label}
          </button>
        ))}
      </div>

      {message && <div className="card py-3 text-sm page-subtitle">{message}</div>}

      {tab === 'profile' && (
        <section className="card space-y-4">
          <h2 className="text-lg font-semibold section-title">Mi perfil</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm field-label mb-1">Nombre</label>
              <input className="input-field" value={profile.full_name || ''} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm field-label mb-1">Puesto</label>
              <input className="input-field" value={profile.job_title || ''} onChange={(e) => setProfile({ ...profile, job_title: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm field-label mb-1">Teléfono</label>
              <input className="input-field" value={profile.phone || ''} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm field-label mb-1">Avatar URL</label>
              <input className="input-field" value={profile.avatar_url || ''} onChange={(e) => setProfile({ ...profile, avatar_url: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={saveProfile} disabled={saving} className="btn-primary flex items-center gap-2 disabled:opacity-50"><Save className="w-4 h-4" /> Guardar perfil</button>
          </div>
        </section>
      )}

      {tab === 'organization' && (
        <section className="card space-y-4">
          <h2 className="text-lg font-semibold section-title">Organización</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm field-label mb-1">Nombre</label>
              <input className="input-field" value={organization.name || ''} onChange={(e) => setOrganization({ ...organization, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm field-label mb-1">Slug</label>
              <input className="input-field" value={organization.slug || ''} onChange={(e) => setOrganization({ ...organization, slug: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm field-label mb-1">Email</label>
              <input className="input-field" value={organization.email || ''} onChange={(e) => setOrganization({ ...organization, email: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm field-label mb-1">Teléfono</label>
              <input className="input-field" value={organization.phone || ''} onChange={(e) => setOrganization({ ...organization, phone: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm field-label mb-1">Dirección</label>
              <input className="input-field" value={organization.address || ''} onChange={(e) => setOrganization({ ...organization, address: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm field-label mb-1">Ciudad</label>
              <input className="input-field" value={organization.city || ''} onChange={(e) => setOrganization({ ...organization, city: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm field-label mb-1">Logo URL</label>
              <input className="input-field" value={organization.logo_url || ''} onChange={(e) => setOrganization({ ...organization, logo_url: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={saveOrganization} disabled={saving} className="btn-primary flex items-center gap-2 disabled:opacity-50"><Save className="w-4 h-4" /> Guardar organización</button>
          </div>
        </section>
      )}

      {tab === 'access' && (
        <section className="card space-y-4">
          <div>
            <h2 className="text-lg font-semibold section-title">Accesos</h2>
            <p className="text-sm page-subtitle">MVP simple. Permite administrar rol, estado y placeholders de acceso.</p>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_180px_auto] items-end">
            <div>
              <label className="block text-sm field-label mb-1">Email</label>
              <input className="input-field" placeholder="persona@empresa.com" value={newMember.invited_email} onChange={(e) => setNewMember({ ...newMember, invited_email: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm field-label mb-1">Rol</label>
              <select className="input-field" value={newMember.role} onChange={(e) => setNewMember({ ...newMember, role: e.target.value as MemberRole })}>
                {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
            </div>
            <button onClick={addMemberPlaceholder} disabled={saving} className="btn-primary disabled:opacity-50">Agregar acceso</button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
            <table className="w-full text-sm">
              <thead className="table-header">
                <tr>
                  <th>Email / referencia</th>
                  <th>Rol</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {members.map((member) => (
                  <tr key={member.id} className="table-row">
                    <td>{member.invited_email || member.user_id}</td>
                    <td>
                      <select className="input-field max-w-[150px]" value={member.role} onChange={(e) => updateMember(member.id, { role: e.target.value as MemberRole })}>
                        {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
                      </select>
                    </td>
                    <td>
                      <button
                        onClick={() => updateMember(member.id, { is_active: !member.is_active })}
                        className={member.is_active ? 'btn-secondary' : 'btn-primary'}
                      >
                        {member.is_active ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                  </tr>
                ))}
                {members.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center page-subtitle">No hay accesos todavía.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
