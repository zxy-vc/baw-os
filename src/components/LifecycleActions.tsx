'use client'

// BaW OS — Acciones de ciclo de vida reusables (Archivar / Restaurar / Eliminar).
// Uniforme para edificios, unidades, contratos e inquilinos. Habla con /api/lifecycle.

import { useState, useRef, useEffect } from 'react'
import { MoreHorizontal, Archive, ArchiveRestore, Trash2, AlertTriangle, Loader2 } from 'lucide-react'
import { useToast } from '@/components/Toast'

type Entity = 'building' | 'unit' | 'contract' | 'occupant'

interface Blocker {
  key: string
  label: string
  count: number
  hardFloor: boolean
}

interface Preflight {
  canDelete: boolean
  canForce: boolean
  blockers: Blocker[]
}

export default function LifecycleActions({
  entity,
  id,
  name,
  archived,
  onChanged,
}: {
  entity: Entity
  id: string
  name: string
  archived: boolean
  onChanged: () => void
}) {
  const toast = useToast()
  const [menuOpen, setMenuOpen] = useState(false)
  const [dialog, setDialog] = useState<null | 'archive' | 'restore' | 'delete'>(null)
  const [preflight, setPreflight] = useState<Preflight | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menuOpen])

  async function post(action: 'archive' | 'restore' | 'delete' | 'force_delete') {
    setLoading(true)
    try {
      const res = await fetch('/api/lifecycle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entity, id, action }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        if (res.status === 409 && Array.isArray(json.blockers)) {
          // Borrado bloqueado: mostramos el detalle en el diálogo.
          setPreflight({
            canDelete: false,
            canForce: json.blockers.length > 0 && !json.blockers.some((b: Blocker) => b.hardFloor),
            blockers: json.blockers,
          })
          setDialog('delete')
          return
        }
        toast.error(json.error || `Error (${res.status})`)
        return
      }
      const verb =
        action === 'archive' ? 'archivado' : action === 'restore' ? 'restaurado' : 'eliminado'
      toast.success(`${cap(LABEL[entity])} ${verb}`)
      close()
      onChanged()
    } catch {
      toast.error('Error de red — intenta de nuevo')
    } finally {
      setLoading(false)
    }
  }

  async function openDelete() {
    setMenuOpen(false)
    setLoading(true)
    try {
      const res = await fetch(`/api/lifecycle?entity=${entity}&id=${id}`)
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.error || 'No se pudo verificar dependencias')
        return
      }
      setPreflight(json.data as Preflight)
      setConfirmText('')
      setDialog('delete')
    } catch {
      toast.error('Error de red — intenta de nuevo')
    } finally {
      setLoading(false)
    }
  }

  function close() {
    setDialog(null)
    setPreflight(null)
    setConfirmText('')
  }

  return (
    <div className="relative inline-block" ref={menuRef}>
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        className="p-1.5 rounded-lg transition-colors"
        style={{ color: 'var(--baw-muted)' }}
        title="Acciones"
        aria-label="Acciones"
      >
        {loading && !dialog ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreHorizontal className="w-4 h-4" />}
      </button>

      {menuOpen && (
        <div
          className="absolute right-0 mt-1 w-44 rounded-lg shadow-lg z-30 overflow-hidden"
          style={{ backgroundColor: 'var(--baw-elevated)', border: '1px solid var(--baw-border)' }}
        >
          {archived ? (
            <MenuItem icon={<ArchiveRestore className="w-4 h-4" />} onClick={() => { setMenuOpen(false); setDialog('restore') }}>
              Restaurar
            </MenuItem>
          ) : (
            <MenuItem icon={<Archive className="w-4 h-4" />} onClick={() => { setMenuOpen(false); setDialog('archive') }}>
              Archivar
            </MenuItem>
          )}
          <MenuItem icon={<Trash2 className="w-4 h-4" />} danger onClick={openDelete}>
            Eliminar
          </MenuItem>
        </div>
      )}

      {/* Diálogo archivar / restaurar */}
      {(dialog === 'archive' || dialog === 'restore') && (
        <Dialog onClose={close}>
          <h3 className="text-[15px] font-semibold mb-2" style={{ color: 'var(--baw-text)' }}>
            {dialog === 'archive' ? 'Archivar' : 'Restaurar'} {LABEL[entity]}
          </h3>
          <p className="text-[13px] mb-4" style={{ color: 'var(--baw-muted)' }}>
            {dialog === 'archive' ? (
              <>
                <strong>{name}</strong> se ocultará de la operación pero conserva todo su historial y
                vínculos. Puedes restaurarlo cuando quieras.
                {entity === 'building' && ' Sus unidades también se archivarán.'}
              </>
            ) : (
              <>
                <strong>{name}</strong> volverá a aparecer en la operación.
                {entity === 'building' && ' Sus unidades archivadas también se restaurarán.'}
              </>
            )}
          </p>
          <DialogButtons>
            <button className="btn-secondary text-[13px] px-4 py-1.5" onClick={close} disabled={loading}>Cancelar</button>
            <button
              className="btn-primary text-[13px] px-4 py-1.5 disabled:opacity-50"
              onClick={() => post(dialog === 'archive' ? 'archive' : 'restore')}
              disabled={loading}
            >
              {loading ? 'Procesando…' : dialog === 'archive' ? 'Archivar' : 'Restaurar'}
            </button>
          </DialogButtons>
        </Dialog>
      )}

      {/* Diálogo eliminar */}
      {dialog === 'delete' && preflight && (
        <Dialog onClose={close}>
          {preflight.canDelete ? (
            <>
              <h3 className="text-[15px] font-semibold mb-2" style={{ color: 'var(--baw-danger-fg)' }}>
                Eliminar {LABEL[entity]}
              </h3>
              <p className="text-[13px] mb-4" style={{ color: 'var(--baw-muted)' }}>
                Vas a eliminar <strong>{name}</strong> de forma <strong>permanente</strong>. Esta acción
                no se puede deshacer.
              </p>
              <DialogButtons>
                <button className="btn-secondary text-[13px] px-4 py-1.5" onClick={close} disabled={loading}>Cancelar</button>
                <button
                  className="text-[13px] px-4 py-1.5 rounded-lg font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: 'var(--baw-danger-fg)' }}
                  onClick={() => post('delete')}
                  disabled={loading}
                >
                  {loading ? 'Eliminando…' : 'Eliminar permanentemente'}
                </button>
              </DialogButtons>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5" style={{ color: 'var(--baw-warning-fg)' }} />
                <h3 className="text-[15px] font-semibold" style={{ color: 'var(--baw-text)' }}>
                  No se puede eliminar directamente
                </h3>
              </div>
              <p className="text-[13px] mb-2" style={{ color: 'var(--baw-muted)' }}>
                <strong>{name}</strong> tiene registros ligados:
              </p>
              <ul className="text-[13px] mb-3 space-y-1">
                {preflight.blockers.map((b) => (
                  <li key={b.key} className="flex items-center gap-2">
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: b.hardFloor ? 'var(--baw-danger-fg)' : 'var(--baw-warning-fg)' }}
                    />
                    <span style={{ color: 'var(--baw-text)' }}>{b.label}</span>
                    {b.hardFloor && <span className="text-[11px]" style={{ color: 'var(--baw-danger-fg)' }}>(no se puede borrar)</span>}
                  </li>
                ))}
              </ul>

              {preflight.blockers.some((b) => b.hardFloor) ? (
                <p className="text-[13px] mb-4 p-2 rounded" style={{ backgroundColor: 'var(--baw-danger-bg-soft, var(--baw-elevated))', color: 'var(--baw-muted)' }}>
                  Incluye <strong>pagos</strong> (historia financiera): no se puede eliminar ni a la fuerza.
                  La opción correcta es <strong>archivar</strong>.
                </p>
              ) : (
                <p className="text-[13px] mb-4" style={{ color: 'var(--baw-muted)' }}>
                  Recomendado: <strong>archivar</strong> (conserva todo). Si de verdad necesitas borrarlo,
                  el <strong>force-delete</strong> eliminará también esos registros en cascada —
                  es <strong>permanente</strong>.
                </p>
              )}

              {preflight.canForce && (
                <div className="mb-4">
                  <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--baw-muted)' }}>
                    Para forzar el borrado, escribe <strong>ELIMINAR</strong>:
                  </label>
                  <input
                    className="input-field w-full"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="ELIMINAR"
                  />
                </div>
              )}

              <DialogButtons>
                <button className="btn-secondary text-[13px] px-4 py-1.5" onClick={close} disabled={loading}>Cancelar</button>
                {!archived && (
                  <button className="btn-primary text-[13px] px-4 py-1.5 disabled:opacity-50" onClick={() => post('archive')} disabled={loading}>
                    {loading ? 'Procesando…' : 'Archivar'}
                  </button>
                )}
                {preflight.canForce && (
                  <button
                    className="text-[13px] px-4 py-1.5 rounded-lg font-medium text-white disabled:opacity-40"
                    style={{ backgroundColor: 'var(--baw-danger-fg)' }}
                    onClick={() => post('force_delete')}
                    disabled={loading || confirmText !== 'ELIMINAR'}
                  >
                    {loading ? 'Eliminando…' : 'Forzar borrado'}
                  </button>
                )}
              </DialogButtons>
            </>
          )}
        </Dialog>
      )}
    </div>
  )
}

const LABEL: Record<Entity, string> = {
  building: 'edificio',
  unit: 'unidad',
  contract: 'contrato',
  occupant: 'inquilino',
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function MenuItem({
  icon,
  children,
  onClick,
  danger,
}: {
  icon: React.ReactNode
  children: React.ReactNode
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left transition-colors hover:opacity-80"
      style={{ color: danger ? 'var(--baw-danger-fg)' : 'var(--baw-text)' }}
    >
      {icon}
      {children}
    </button>
  )
}

function Dialog({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl p-5"
        style={{ backgroundColor: 'var(--baw-surface)', border: '1px solid var(--baw-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

function DialogButtons({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-end gap-2 flex-wrap">{children}</div>
}

export function ArchivedBadge() {
  return (
    <span
      className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full font-medium"
      style={{ backgroundColor: 'var(--baw-neutral-bg-soft)', color: 'var(--baw-neutral-fg)' }}
    >
      Archivado
    </span>
  )
}
