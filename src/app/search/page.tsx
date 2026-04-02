'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, Building2, FileText, Users, Wrench } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

interface SearchResult {
  category: 'units' | 'contracts' | 'occupants' | 'incidents'
  id: string
  title: string
  subtitle: string
  href: string
}

const CATEGORY_META = {
  units: { label: 'Unidades', icon: Building2 },
  contracts: { label: 'Contratos', icon: FileText },
  occupants: { label: 'Inquilinos', icon: Users },
  incidents: { label: 'Incidencias', icon: Wrench },
}

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!query.trim()) {
      setResults([])
      return
    }
    timerRef.current = setTimeout(() => {
      performSearch(query.trim())
    }, 300)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [query])

  async function performSearch(q: string) {
    setLoading(true)
    const pattern = `%${q}%`

    const [unitsRes, contractsRes, occupantsRes, incidentsRes] = await Promise.all([
      supabase
        .from('units')
        .select('id, number, notes, status')
        .or(`number.ilike.${pattern},notes.ilike.${pattern}`)
        .limit(5),
      supabase
        .from('contracts')
        .select('id, status, occupant:occupants(name), unit:units(number)')
        .or(`occupant.name.ilike.${pattern}`)
        .limit(5),
      supabase
        .from('occupants')
        .select('id, name, phone, email')
        .or(`name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern}`)
        .limit(5),
      supabase
        .from('incidents')
        .select('id, title, status, unit:units(number)')
        .ilike('title', pattern)
        .limit(5),
    ])

    const items: SearchResult[] = []

    for (const u of unitsRes.data || []) {
      items.push({
        category: 'units',
        id: u.id,
        title: `Unidad ${u.number}`,
        subtitle: u.status || '',
        href: `/units/${u.id}`,
      })
    }

    for (const c of contractsRes.data || []) {
      const occ = (c.occupant as unknown as { name: string } | null)?.name || 'Sin inquilino'
      const unitNum = (c.unit as unknown as { number: string } | null)?.number || '—'
      items.push({
        category: 'contracts',
        id: c.id,
        title: `${occ} — Unidad ${unitNum}`,
        subtitle: c.status,
        href: `/contracts/${c.id}`,
      })
    }

    for (const o of occupantsRes.data || []) {
      items.push({
        category: 'occupants',
        id: o.id,
        title: o.name,
        subtitle: [o.phone, o.email].filter(Boolean).join(' · ') || '',
        href: `/contacts`,
      })
    }

    for (const i of incidentsRes.data || []) {
      const unitNum = (i.unit as unknown as { number: string } | null)?.number
      items.push({
        category: 'incidents',
        id: i.id,
        title: i.title,
        subtitle: [i.status, unitNum ? `Unidad ${unitNum}` : ''].filter(Boolean).join(' · '),
        href: `/maintenance`,
      })
    }

    setResults(items)
    setLoading(false)
  }

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.category]) acc[r.category] = []
    acc[r.category].push(r)
    return acc
  }, {})

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Search className="w-6 h-6 text-indigo-500" />
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Buscar</h1>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Busca deptos, inquilinos, contratos o incidencias"
          className="input-field w-full pl-10 py-3 text-base"
        />
      </div>

      {loading && (
        <p className="text-sm text-gray-400 dark:text-gray-500 animate-pulse">Buscando...</p>
      )}

      {!loading && query.trim() && results.length === 0 && (
        <p className="text-sm text-gray-400 dark:text-gray-500">Sin resultados para &ldquo;{query}&rdquo;</p>
      )}

      {!query.trim() && !loading && (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          Busca deptos, inquilinos, contratos o incidencias
        </p>
      )}

      {Object.entries(grouped).map(([cat, items]) => {
        const meta = CATEGORY_META[cat as keyof typeof CATEGORY_META]
        const Icon = meta.icon
        return (
          <div key={cat} className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400">
              <Icon className="w-4 h-4" />
              {meta.label}
            </div>
            <div className="space-y-1">
              {items.map((r) => (
                <Link
                  key={r.id}
                  href={r.href}
                  className="block card py-3 px-4 hover:border-indigo-500/50 transition-colors"
                >
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{r.title}</p>
                  {r.subtitle && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">{r.subtitle}</p>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
