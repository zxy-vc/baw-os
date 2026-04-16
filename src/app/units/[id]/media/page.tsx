'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, GripVertical, ImagePlus, Plus, Save, Trash2, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { MediaAsset, SpaceKind, Unit, UnitSpace } from '@/types'

const spaceKinds: { value: SpaceKind; label: string }[] = [
  { value: 'bedroom', label: 'Recámara' },
  { value: 'bathroom', label: 'Baño' },
  { value: 'kitchen', label: 'Cocina' },
  { value: 'living_room', label: 'Sala' },
  { value: 'dining_room', label: 'Comedor' },
  { value: 'workspace', label: 'Workspace' },
  { value: 'balcony', label: 'Balcón' },
  { value: 'terrace', label: 'Terraza' },
  { value: 'laundry', label: 'Lavandería' },
  { value: 'exterior', label: 'Exterior' },
  { value: 'other', label: 'Otro' },
]

function safeAmenities(input: Unit['amenities']): string[] {
  if (!Array.isArray(input)) return []
  return input.map((item) => (typeof item === 'string' ? item : item?.label)).filter(Boolean) as string[]
}

export default function UnitMediaPage() {
  const params = useParams()
  const unitId = params.id as string
  const [unit, setUnit] = useState<Unit | null>(null)
  const [spaces, setSpaces] = useState<UnitSpace[]>([])
  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newAmenity, setNewAmenity] = useState('')

  async function load() {
    setLoading(true)
    const [unitRes, spacesRes, assetsRes] = await Promise.all([
      supabase.from('units').select('*').eq('id', unitId).single(),
      supabase.from('unit_spaces').select('*').eq('unit_id', unitId).order('sort_order'),
      supabase.from('media_assets').select('*').eq('unit_id', unitId).order('sort_order'),
    ])
    setUnit(unitRes.data)
    setSpaces((spacesRes.data || []) as UnitSpace[])
    setAssets((assetsRes.data || []) as MediaAsset[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [unitId])

  const unitAmenities = useMemo(() => safeAmenities(unit?.amenities), [unit])
  const generalAssets = useMemo(() => assets.filter((asset) => !asset.unit_space_id), [assets])

  async function updateUnit(fields: Partial<Unit>) {
    if (!unit) return
    setUnit({ ...unit, ...fields })
    const { error, data } = await supabase.from('units').update(fields).eq('id', unit.id).select('*').single()
    if (!error && data) setUnit(data as Unit)
  }

  async function addSpace() {
    if (!unit) return
    const payload = {
      org_id: unit.org_id,
      unit_id: unit.id,
      name: `Espacio ${spaces.length + 1}`,
      kind: 'other' as SpaceKind,
      sort_order: spaces.length,
    }
    const { data } = await supabase.from('unit_spaces').insert(payload).select('*').single()
    if (data) setSpaces([...spaces, data as UnitSpace])
  }

  async function updateSpace(spaceId: string, fields: Partial<UnitSpace>) {
    setSpaces((current) => current.map((space) => (space.id === spaceId ? { ...space, ...fields } : space)))
    await supabase.from('unit_spaces').update(fields).eq('id', spaceId)
  }

  async function removeSpace(spaceId: string) {
    await supabase.from('media_assets').update({ unit_space_id: null }).eq('unit_space_id', spaceId)
    await supabase.from('unit_spaces').delete().eq('id', spaceId)
    setSpaces((current) => current.filter((space) => space.id !== spaceId))
    setAssets((current) => current.map((asset) => asset.unit_space_id === spaceId ? { ...asset, unit_space_id: undefined } : asset))
  }

  async function addAmenity() {
    const label = newAmenity.trim()
    if (!label || !unit) return
    const next = [...unitAmenities, label]
    setNewAmenity('')
    await updateUnit({ amenities: next })
  }

  async function removeAmenity(label: string) {
    if (!unit) return
    await updateUnit({ amenities: unitAmenities.filter((item) => item !== label) })
  }

  async function uploadFiles(files: FileList | null, unitSpaceId?: string) {
    if (!files || !unit) return
    setSaving(true)
    const uploaded: MediaAsset[] = []

    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop() || 'bin'
      const path = `${unit.id}/${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('unit-media').upload(path, file, { upsert: false, contentType: file.type })
      if (uploadError) continue

      const { data: publicUrlData } = supabase.storage.from('unit-media').getPublicUrl(path)
      const payload = {
        org_id: unit.org_id,
        unit_id: unit.id,
        unit_space_id: unitSpaceId || null,
        kind: 'image',
        visibility: 'internal',
        title: file.name,
        storage_bucket: 'unit-media',
        storage_path: path,
        file_url: publicUrlData.publicUrl,
        mime_type: file.type || null,
        sort_order: assets.length + uploaded.length,
        is_cover: false,
      }
      const { data } = await supabase.from('media_assets').insert(payload).select('*').single()
      if (data) uploaded.push(data as MediaAsset)
    }

    setAssets((current) => [...current, ...uploaded])
    setSaving(false)
  }

  async function updateAsset(assetId: string, fields: Partial<MediaAsset>) {
    setAssets((current) => current.map((asset) => asset.id === assetId ? { ...asset, ...fields } : asset))
    await supabase.from('media_assets').update(fields).eq('id', assetId)
  }

  async function setCover(assetId: string) {
    if (!unit) return
    const updates = assets.map((asset) => ({ id: asset.id, is_cover: asset.id === assetId }))
    setAssets((current) => current.map((asset) => ({ ...asset, is_cover: asset.id === assetId })))
    for (const row of updates) await supabase.from('media_assets').update({ is_cover: row.is_cover }).eq('id', row.id)
  }

  async function removeAsset(asset: MediaAsset) {
    if (asset.storage_bucket && asset.storage_path) {
      await supabase.storage.from(asset.storage_bucket).remove([asset.storage_path])
    }
    await supabase.from('media_assets').delete().eq('id', asset.id)
    setAssets((current) => current.filter((item) => item.id !== asset.id))
  }

  if (loading) return <div className="text-gray-500">Cargando media…</div>
  if (!unit) return <div className="text-gray-500">Unidad no encontrada.</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link href={`/units/${unit.id}`} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white mb-2">
            <ArrowLeft className="w-4 h-4" /> Volver a unidad
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Media y espacios · Depto {unit.number}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Tier 1A interno. Carga, ordena y persiste assets por unidad y espacio.</p>
        </div>
        <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium cursor-pointer">
          <Upload className="w-4 h-4" /> Subir fotos generales
          <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => uploadFiles(e.target.files)} />
        </label>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Resumen de listing interno</h2>
            {saving && <span className="text-xs text-indigo-500">Guardando archivos…</span>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Título</label>
              <input className="input-field" value={unit.title || ''} onChange={(e) => setUnit({ ...unit, title: e.target.value })} onBlur={(e) => updateUnit({ title: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Slug</label>
              <input className="input-field" value={unit.slug || ''} onChange={(e) => setUnit({ ...unit, slug: e.target.value })} onBlur={(e) => updateUnit({ slug: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Descripción corta</label>
            <textarea className="input-field" rows={2} value={unit.description_short || ''} onChange={(e) => setUnit({ ...unit, description_short: e.target.value })} onBlur={(e) => updateUnit({ description_short: e.target.value })} />
          </div>

          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Descripción larga</label>
            <textarea className="input-field" rows={4} value={unit.description_long || ''} onChange={(e) => setUnit({ ...unit, description_long: e.target.value })} onBlur={(e) => updateUnit({ description_long: e.target.value })} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm text-gray-500 dark:text-gray-400">Amenities</label>
              <div className="flex gap-2">
                <input className="input-field h-9 w-48" placeholder="Ej. Pet friendly" value={newAmenity} onChange={(e) => setNewAmenity(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addAmenity())} />
                <button onClick={addAmenity} className="px-3 py-2 rounded-lg bg-gray-900 text-white dark:bg-white dark:text-gray-900 text-sm">Agregar</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {unitAmenities.length === 0 && <span className="text-sm text-gray-500">Sin amenities todavía.</span>}
              {unitAmenities.map((amenity) => (
                <button key={amenity} onClick={() => removeAmenity(amenity)} className="px-3 py-1 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200 text-sm">
                  {amenity} ×
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Galería general</h2>
            <span className="text-xs text-gray-500">{generalAssets.length} asset(s)</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {generalAssets.map((asset, index) => (
              <div key={asset.id} className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-50 dark:bg-gray-900">
                {asset.file_url ? <img src={asset.file_url} alt={asset.alt_text || asset.title || ''} className="w-full h-32 object-cover" /> : <div className="h-32 grid place-items-center text-gray-400"><ImagePlus className="w-6 h-6" /></div>}
                <div className="p-3 space-y-2">
                  <input className="input-field h-9" value={asset.title || ''} placeholder="Título" onChange={(e) => updateAsset(asset.id, { title: e.target.value })} />
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <button onClick={() => updateAsset(asset.id, { sort_order: Math.max(0, index - 1) })} className="inline-flex items-center gap-1 hover:text-gray-900 dark:hover:text-white"><GripVertical className="w-3 h-3" /> Orden</button>
                    <button onClick={() => setCover(asset.id)} className={asset.is_cover ? 'text-green-600 font-medium' : 'hover:text-gray-900 dark:hover:text-white'}>{asset.is_cover ? 'Cover' : 'Marcar cover'}</button>
                    <button onClick={() => removeAsset(asset)} className="text-red-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            ))}
            {generalAssets.length === 0 && <p className="text-sm text-gray-500 col-span-2">Sube fotos generales de la unidad para empezar.</p>}
          </div>
        </section>
      </div>

      <section className="card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Espacios</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Agrupa assets por espacio y persiste metadata.</p>
          </div>
          <button onClick={addSpace} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium">
            <Plus className="w-4 h-4" /> Agregar espacio
          </button>
        </div>

        <div className="space-y-4">
          {spaces.map((space) => {
            const spaceAssets = assets.filter((asset) => asset.unit_space_id === space.id)
            return (
              <div key={space.id} className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-4">
                <div className="grid gap-4 md:grid-cols-[1fr_220px_120px_auto] items-end">
                  <div>
                    <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Nombre</label>
                    <input className="input-field" value={space.name} onChange={(e) => updateSpace(space.id, { name: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Tipo</label>
                    <select className="input-field" value={space.kind} onChange={(e) => updateSpace(space.id, { kind: e.target.value as SpaceKind })}>
                      {spaceKinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Orden</label>
                    <input className="input-field" type="number" value={space.sort_order} onChange={(e) => updateSpace(space.id, { sort_order: Number(e.target.value) || 0 })} />
                  </div>
                  <button onClick={() => removeSpace(space.id)} className="h-10 px-3 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/30">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <textarea className="input-field" rows={2} placeholder="Descripción del espacio" value={space.description || ''} onChange={(e) => updateSpace(space.id, { description: e.target.value })} />

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Fotos del espacio</span>
                  <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-900 text-white dark:bg-white dark:text-gray-900 text-sm cursor-pointer">
                    <Upload className="w-4 h-4" /> Subir
                    <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => uploadFiles(e.target.files, space.id)} />
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {spaceAssets.map((asset) => (
                    <div key={asset.id} className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
                      {asset.file_url ? <img src={asset.file_url} alt={asset.alt_text || asset.title || ''} className="w-full h-28 object-cover" /> : <div className="h-28 bg-gray-100 dark:bg-gray-900" />}
                      <div className="p-2 space-y-2">
                        <input className="input-field h-8 text-sm" value={asset.title || ''} placeholder="Título" onChange={(e) => updateAsset(asset.id, { title: e.target.value })} />
                        <div className="flex items-center justify-between text-xs">
                          <button onClick={() => updateAsset(asset.id, { visibility: asset.visibility === 'internal' ? 'public' : 'internal' })} className="text-gray-500 hover:text-gray-900 dark:hover:text-white">{asset.visibility}</button>
                          <button onClick={() => updateAsset(asset.id, { unit_space_id: undefined })} className="text-gray-500 hover:text-gray-900 dark:hover:text-white">General</button>
                          <button onClick={() => removeAsset(asset)} className="text-red-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {spaceAssets.length === 0 && <p className="text-sm text-gray-500 col-span-full">Este espacio todavía no tiene fotos.</p>}
                </div>
              </div>
            )
          })}

          {spaces.length === 0 && <p className="text-sm text-gray-500">No hay espacios todavía. Agrega el primero para organizar fotos.</p>}
        </div>
      </section>

      <div className="text-xs text-gray-500 flex items-center gap-2">
        <Save className="w-3.5 h-3.5" /> Done de Tier 1A: carga, edición y persistencia interna. Front público todavía no.
      </div>
    </div>
  )
}
