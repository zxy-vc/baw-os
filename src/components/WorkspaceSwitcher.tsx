'use client'

// BaW OS — WorkspaceSwitcher (Sprint 3 / S4)
// Reemplaza el chip "Frontier Bay" hardcoded en Sidebar.
// Lee organizations + buildings reales del usuario via useActiveContext.

import { useState, useRef, useEffect } from 'react'
import { Building2, ChevronRight, Check, Plus } from 'lucide-react'
import Link from 'next/link'
import { useActiveContext } from '@/lib/useActiveContext'

interface Props {
  expanded: boolean
}

export default function WorkspaceSwitcher({ expanded }: Props) {
  const {
    loading,
    orgs,
    buildings,
    activeOrgId,
    activeBuildingId,
    setActiveOrgId,
    setActiveBuildingId,
  } = useActiveContext()

  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const activeOrg = orgs.find((o) => o.id === activeOrgId)
  const activeBuilding = buildings.find((b) => b.id === activeBuildingId)
  const buildingsForActiveOrg = buildings.filter(
    (b) => b.org_id === activeOrgId,
  )

  // Estados sin datos
  const isEmpty = !loading && orgs.length === 0
  const titleText = isEmpty
    ? 'Sin PM Company'
    : activeOrg?.name ?? '—'
  const subText = isEmpty
    ? 'Empezar onboarding'
    : activeBuilding
    ? `${activeBuilding.name}${activeBuilding.city ? `, ${activeBuilding.city}` : ''}`
    : 'Sin edificio'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !isEmpty && setOpen((o) => !o)}
        className="flex items-center h-9 mx-2 rounded-md transition-colors hover:bg-white/5 w-[calc(100%-16px)]"
        style={{ color: 'var(--baw-text)' }}
        title={!expanded ? titleText : undefined}
      >
        <span className="flex items-center justify-center w-[40px] shrink-0">
          <Building2
            className="w-[18px] h-[18px]"
            style={{ color: 'var(--baw-muted)' }}
          />
        </span>
        {expanded && (
          <span className="flex items-center justify-between flex-1 min-w-0 pr-3">
            <span className="flex flex-col items-start min-w-0">
              <span className="text-[12px] font-medium truncate">
                {titleText}
              </span>
              <span
                className="text-[10px] truncate"
                style={{ color: 'var(--baw-muted)' }}
              >
                {subText}
              </span>
            </span>
            {!isEmpty && (
              <ChevronRight
                className="w-3.5 h-3.5"
                style={{ color: 'var(--baw-muted)' }}
              />
            )}
          </span>
        )}
      </button>

      {open && expanded && !isEmpty && (
        <div
          className="absolute left-2 right-2 bottom-full mb-2 rounded-md shadow-lg z-50 overflow-hidden"
          style={{
            backgroundColor: 'var(--baw-surface)',
            border: '1px solid var(--baw-border)',
          }}
        >
          {orgs.length > 1 && (
            <>
              <div
                className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider"
                style={{ color: 'var(--baw-muted)' }}
              >
                PM Company
              </div>
              <ul>
                {orgs.map((org) => (
                  <li key={org.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveOrgId(org.id)
                      }}
                      className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-[12px] hover:bg-white/5"
                      style={{ color: 'var(--baw-text)' }}
                    >
                      <span className="truncate">{org.name}</span>
                      {org.id === activeOrgId && (
                        <Check
                          size={12}
                          style={{ color: 'var(--baw-primary)' }}
                        />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              <div
                className="border-t my-1"
                style={{ borderColor: 'var(--baw-border)' }}
              />
            </>
          )}

          <div
            className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider"
            style={{ color: 'var(--baw-muted)' }}
          >
            Edificio
          </div>
          {buildingsForActiveOrg.length === 0 ? (
            <div
              className="px-3 py-2 text-[12px]"
              style={{ color: 'var(--baw-muted)' }}
            >
              Esta organización aún no tiene edificios.
            </div>
          ) : (
            <ul>
              {buildingsForActiveOrg.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveBuildingId(b.id)
                      setOpen(false)
                    }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-[12px] hover:bg-white/5"
                    style={{ color: 'var(--baw-text)' }}
                  >
                    <span className="flex flex-col items-start min-w-0">
                      <span className="truncate">{b.name}</span>
                      {b.city && (
                        <span
                          className="text-[10px] truncate"
                          style={{ color: 'var(--baw-muted)' }}
                        >
                          {b.city}
                        </span>
                      )}
                    </span>
                    {b.id === activeBuildingId && (
                      <Check
                        size={12}
                        style={{ color: 'var(--baw-primary)' }}
                      />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div
            className="border-t mt-1"
            style={{ borderColor: 'var(--baw-border)' }}
          />
          <Link
            href="/onboarding"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-white/5"
            style={{ color: 'var(--baw-primary)' }}
          >
            <Plus size={12} />
            Agregar edificio
          </Link>
        </div>
      )}

      {/* CTA cuando no hay nada */}
      {isEmpty && expanded && (
        <Link
          href="/onboarding"
          className="absolute inset-0 flex items-center"
          aria-label="Empezar onboarding"
        />
      )}
    </div>
  )
}
