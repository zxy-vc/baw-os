'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, ExternalLink, Globe, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Building, MediaAsset, Unit } from '@/types'

/**
 * Fase 1 Public Listing — pestaña "Publicación" de la unidad.
 *
 * Controla los campos que alimentan el sitio público
 * (/edificios/[buildingSlug]/unidades/[slug]) sin tocar SQL:
 * nombre y descripción públicos, hero (desde las fotos públicas de media),
 * tarifas, capacidad y el switch is_publicly_bookable.
 *
 * Las fotos se gestionan en /units/[id]/media (visibility public/internal).
 */

const PUBLISHABLE_TYPES = ['STR', 'MTR', 'LTR']

export default function UnitPublicacionPage() {
  const params = useParams()
  const unitId = params.id as string

  const [unit, setUnit] = useState<Unit | null>(null)
  const [building, setBuilding] = useState<Building | null>(null)
  const [publicAssets, setPublicAssets] = useState<MediaAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Draft del formulario
  const [publicName, setPublicName] = useState('')
  const [publicDescription, setPublicDescription] = useState('')
  const [slug, setSlug] = useState('')
  const [heroUrl, setHeroUrl] = useState('')
  const [baseRate, setBaseRate] = useState('')
  const [monthlyRate, setMonthlyRate] = useState('')
  const [cleaningFee, setCleaningFee] = useState('')
  const [maxGuests, setMaxGuests] = useState('2')
  const [minNights, setMinNights] = useState('1')
  const [isPublic, setIsPublic] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [unitRes, assetsRes] = await Promise.all([
          supabase.from('units').select('*').eq('id', unitId).maybeSingle(),
          supabase
            .from('media_assets')
            .select('*')
            .eq('unit_id', unitId)
            .eq('visibility', 'public')
            .eq('kind', 'image')
            .order('sort_order'),
        ])
        if (cancelled) return
        const u = unitRes.data as Unit | null
        setUnit(u)
        setPublicAssets((assetsRes.data || []) as MediaAsset[])
        if (u) {
          setPublicName(u.public_name ?? '')
          setPublicDescription(u.public_description ?? '')
          setSlug(u.slug ?? '')
          setHeroUrl(u.hero_url ?? '')
          setBaseRate(u.base_rate_mxn != null ? String(u.base_rate_mxn) : '')
          setMonthlyRate(u.monthly_rate_mxn != null ? String(u.monthly_rate_mxn) : '')
          setCleaningFee(u.cleaning_fee_mxn != null ? String(u.cleaning_fee_mxn) : '0')
          setMaxGuests(String(u.max_guests ?? 2))
          setMinNights(String(u.min_nights ?? 1))
          setIsPublic(Boolean(u.is_publicly_bookable))
          if (u.building_id) {
            const { data: b } = await supabase
              .from('buildings')
              .select('*')
              .eq('id', u.building_id)
              .maybeSingle()
            if (!cancelled) setBuilding(b as Building | null)
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [unitId])

  const publishBlockers = useMemo(() => {
    const blockers: string[] = []
    if (!unit) return blockers
    if (!PUBLISHABLE_TYPES.includes(unit.type)) {
      blockers.push(`El tipo de unidad "${unit.type}" no es publicable (solo STR/MTR/LTR).`)
    }
    if (!slug.trim()) blockers.push('Falta el slug público (URL de la unidad).')
    if (!unit.building_id) blockers.push('La unidad no está ligada a un edificio.')
    if (building && !building.is_public_listed) {
      blockers.push('El edificio no está listado públicamente (actívalo en Portafolio → Edificios).')
    }
    if (unit.type === 'STR' && !baseRate) blockers.push('Falta la tarifa por noche (STR).')
    if (unit.type !== 'STR' && !monthlyRate) blockers.push('Falta la renta mensual (MTR/LTR).')
    return blockers
  }, [unit, building, slug, baseRate, monthlyRate])

  const publicUrl =
    building?.slug && slug ? `/edificios/${building.slug}/unidades/${slug}` : null

  async function save() {
    if (!unit) return
    setSaving(true)
    setError(null)
    const payload: Record<string, unknown> = {
      public_name: publicName.trim() || null,
      public_description: publicDescription.trim() || null,
      slug: slug.trim() || null,
      hero_url: heroUrl.trim() || null,
      base_rate_mxn: baseRate === '' ? null : Number(baseRate),
      monthly_rate_mxn: monthlyRate === '' ? null : Number(monthlyRate),
      cleaning_fee_mxn: cleaningFee === '' ? 0 : Number(cleaningFee),
      max_guests: Number(maxGuests) || 2,
      min_nights: Number(minNights) || 1,
      is_publicly_bookable: isPublic && publishBlockers.length === 0,
    }
    const { error: err } = await supabase.from('units').update(payload).eq('id', unit.id)
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setSavedAt(Date.now())
    setUnit({ ...unit, ...(payload as Partial<Unit>) })
  }

  if (loading) {
    return (
      <div style={{ padding: 32, color: 'var(--baw-muted)' }}>Cargando…</div>
    )
  }

  if (!unit) {
    return (
      <div style={{ padding: 32 }}>
        <p style={{ color: 'var(--baw-text)' }}>Unidad no encontrada.</p>
        <Link href="/units" style={{ color: 'var(--baw-accent)' }}>
          ← Volver a unidades
        </Link>
      </div>
    )
  }

  return (
    <div style={{ padding: 32, maxWidth: 860 }}>
      <Link
        href={`/units/${unit.id}`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--baw-muted)', fontSize: 14, marginBottom: 20 }}
      >
        <ArrowLeft size={16} /> Unidad {unit.number}
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 8 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: 'var(--baw-text)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Globe size={20} /> Publicación
        </h1>
        {publicUrl && unit.is_publicly_bookable && (
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--baw-accent)' }}
          >
            Ver página pública <ExternalLink size={14} />
          </a>
        )}
      </div>
      <p style={{ fontSize: 14, color: 'var(--baw-muted)', marginBottom: 28 }}>
        Estos campos alimentan el sitio público del edificio. Las fotografías
        se controlan en{' '}
        <Link href={`/units/${unit.id}/media`} style={{ color: 'var(--baw-accent)' }}>
          Media y espacios
        </Link>{' '}
        (solo las marcadas como <strong>public</strong> aparecen en el sitio).
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Field label="Nombre público" hint="Ej. “Estudio 03 · Piso 1”">
          <input
            className="baw-input"
            style={inputStyle}
            value={publicName}
            onChange={(e) => setPublicName(e.target.value)}
            placeholder={unit.title ?? `Unidad ${unit.number}`}
          />
        </Field>

        <Field label="Descripción pública">
          <textarea
            style={{ ...inputStyle, resize: 'vertical' }}
            rows={4}
            value={publicDescription}
            onChange={(e) => setPublicDescription(e.target.value)}
            placeholder={unit.description_long ?? unit.description_short ?? ''}
          />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Field label="Slug (URL pública)" hint="Único en toda la plataforma">
            <input
              className="baw-input"
              style={inputStyle}
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
              placeholder="mateos-809-01"
            />
          </Field>
          <Field label="Tipo de renta" hint="Se cambia en la ficha de la unidad">
            <input className="baw-input" style={{ ...inputStyle, opacity: 0.7 }} value={unit.type} readOnly />
          </Field>
        </div>

        <Field label="Foto principal (hero)">
          {publicAssets.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
              {publicAssets.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setHeroUrl(a.file_url ?? '')}
                  style={{
                    padding: 0,
                    border:
                      heroUrl === a.file_url
                        ? '2px solid var(--baw-accent)'
                        : '1px solid var(--baw-border)',
                    borderRadius: 8,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    background: 'var(--baw-surface)',
                    aspectRatio: '4 / 3',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.file_url ?? ''}
                    alt={a.alt_text ?? ''}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </button>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--baw-muted)' }}>
              No hay fotos públicas todavía. Sube fotos en{' '}
              <Link href={`/units/${unit.id}/media`} style={{ color: 'var(--baw-accent)' }}>
                Media y espacios
              </Link>{' '}
              y márcalas como públicas.
            </p>
          )}
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
          <Field label="Tarifa por noche (MXN)" hint="Estancia corta">
            <input className="baw-input" style={inputStyle} type="number" min="0" value={baseRate} onChange={(e) => setBaseRate(e.target.value)} />
          </Field>
          <Field label="Renta mensual (MXN)" hint="Renta media/larga">
            <input className="baw-input" style={inputStyle} type="number" min="0" value={monthlyRate} onChange={(e) => setMonthlyRate(e.target.value)} />
          </Field>
          <Field label="Limpieza (MXN)">
            <input className="baw-input" style={inputStyle} type="number" min="0" value={cleaningFee} onChange={(e) => setCleaningFee(e.target.value)} />
          </Field>
          <Field label="Huéspedes máx">
            <input className="baw-input" style={inputStyle} type="number" min="1" value={maxGuests} onChange={(e) => setMaxGuests(e.target.value)} />
          </Field>
          <Field label="Noches mín">
            <input className="baw-input" style={inputStyle} type="number" min="1" value={minNights} onChange={(e) => setMinNights(e.target.value)} />
          </Field>
        </div>

        {/* Switch de publicación */}
        <div
          style={{
            padding: 16,
            border: '1px solid var(--baw-border)',
            borderRadius: 10,
            background: 'var(--baw-surface)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', color: 'var(--baw-text)', fontWeight: 500 }}>
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              disabled={publishBlockers.length > 0}
            />
            Visible en el sitio público
          </label>
          {publishBlockers.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--baw-danger)' }}>
              {publishBlockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
        </div>

        {error && (
          <p role="alert" style={{ fontSize: 13, color: 'var(--baw-danger)' }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 20px',
              borderRadius: 8,
              border: '1px solid var(--baw-accent)',
              background: 'var(--baw-accent)',
              color: 'var(--baw-bg)',
              fontWeight: 500,
              cursor: 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            <Save size={16} /> {saving ? 'Guardando…' : 'Guardar publicación'}
          </button>
          {savedAt && !error && (
            <span style={{ fontSize: 13, color: 'var(--baw-muted)' }}>Guardado ✓</span>
          )}
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--baw-border)',
  background: 'var(--baw-surface)',
  color: 'var(--baw-text)',
  fontSize: 14,
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--baw-text)' }}>{label}</label>
        {hint && <span style={{ fontSize: 12, color: 'var(--baw-muted)' }}>{hint}</span>}
      </div>
      {children}
    </div>
  )
}
