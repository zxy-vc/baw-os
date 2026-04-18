'use client'

export const dynamic = 'force-dynamic'

import { useState, useRef, useCallback } from 'react'
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X, Loader2 } from 'lucide-react'
import Link from 'next/link'

interface CsvRow {
  numero_unidad: string
  piso: string
  tipo: string
  renta_mensual: string
  inquilino_nombre: string
  inquilino_tel: string
  fecha_inicio: string
  fecha_fin: string
}

interface ParsedRow {
  raw: CsvRow
  errors: string[]
  index: number
}

const EXPECTED_HEADERS = [
  'numero_unidad', 'piso', 'tipo', 'renta_mensual',
  'inquilino_nombre', 'inquilino_tel', 'fecha_inicio', 'fecha_fin',
]

const VALID_TYPES = ['STR', 'LTR', 'MTR']

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length === 0) return { headers: [], rows: [] }
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))
  const rows = lines.slice(1).filter(l => l.trim()).map(l => l.split(',').map(c => c.trim()))
  return { headers, rows }
}

function validateRow(row: CsvRow, index: number): ParsedRow {
  const errors: string[] = []
  if (!row.numero_unidad) errors.push('numero_unidad requerido')
  if (!row.piso || isNaN(Number(row.piso))) errors.push('piso debe ser número')
  if (!VALID_TYPES.includes(row.tipo?.toUpperCase())) errors.push('tipo debe ser STR, LTR o MTR')
  if (!row.renta_mensual || isNaN(Number(row.renta_mensual)) || Number(row.renta_mensual) <= 0) errors.push('renta_mensual inválida')
  if (row.fecha_inicio && !/^\d{4}-\d{2}-\d{2}$/.test(row.fecha_inicio)) errors.push('fecha_inicio formato YYYY-MM-DD')
  if (row.fecha_fin && !/^\d{4}-\d{2}-\d{2}$/.test(row.fecha_fin)) errors.push('fecha_fin formato YYYY-MM-DD')
  return { raw: row, errors, index }
}

export default function BulkImportPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [headerError, setHeaderError] = useState('')
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [result, setResult] = useState<{ units_created: number; contracts_created: number; errors: number } | null>(null)

  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    setToastMsg({ type, msg })
    setTimeout(() => setToastMsg(null), 4000)
  }, [])

  const processFile = useCallback((file: File) => {
    setResult(null)
    setHeaderError('')
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const { headers, rows } = parseCsv(text)

      // Validate headers
      const missing = EXPECTED_HEADERS.filter(h => !headers.includes(h))
      if (missing.length > 0) {
        setHeaderError(`Columnas faltantes: ${missing.join(', ')}`)
        setParsedRows([])
        return
      }

      const parsed = rows.map((cols, i) => {
        const row: CsvRow = {
          numero_unidad: cols[headers.indexOf('numero_unidad')] || '',
          piso: cols[headers.indexOf('piso')] || '',
          tipo: cols[headers.indexOf('tipo')] || '',
          renta_mensual: cols[headers.indexOf('renta_mensual')] || '',
          inquilino_nombre: cols[headers.indexOf('inquilino_nombre')] || '',
          inquilino_tel: cols[headers.indexOf('inquilino_tel')] || '',
          fecha_inicio: cols[headers.indexOf('fecha_inicio')] || '',
          fecha_fin: cols[headers.indexOf('fecha_fin')] || '',
        }
        return validateRow(row, i)
      })
      setParsedRows(parsed)
    }
    reader.readAsText(file)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
      processFile(file)
    } else {
      showToast('error', 'Solo se aceptan archivos .csv')
    }
  }, [processFile])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }, [processFile])

  const validRows = parsedRows.filter(r => r.errors.length === 0)
  const errorRows = parsedRows.filter(r => r.errors.length > 0)

  async function handleImport() {
    if (validRows.length === 0) return
    setImporting(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const units = validRows.map(r => ({
        number: r.raw.numero_unidad,
        type: r.raw.tipo.toUpperCase() as 'STR' | 'LTR' | 'MTR',
        floor: Number(r.raw.piso),
      }))
      const tenants = validRows
        .filter(r => r.raw.inquilino_nombre)
        .map(r => ({
          name: r.raw.inquilino_nombre,
          phone: r.raw.inquilino_tel || undefined,
          unit_number: r.raw.numero_unidad,
          monthly_amount: Number(r.raw.renta_mensual),
          start_date: r.raw.fecha_inicio || today,
        }))

      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          building: { name: 'Importación CSV', address: '', city: '' },
          units,
          tenants,
        }),
      })
      const json = await res.json()
      if (json.success) {
        setResult({
          units_created: json.data.units_created,
          contracts_created: json.data.contracts_created,
          errors: errorRows.length,
        })
        showToast('success', `${json.data.units_created} unidades importadas`)
      } else {
        showToast('error', json.error || 'Error al importar')
      }
    } catch {
      showToast('error', 'Error de conexión')
    }
    setImporting(false)
  }

  function reset() {
    setParsedRows([])
    setHeaderError('')
    setFileName('')
    setResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="space-y-6">
      {toastMsg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
          toastMsg.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toastMsg.msg}
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Importar CSV</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Carga masiva de unidades y contratos</p>
        </div>
        <Link
          href="/onboarding"
          className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          ← Configuración
        </Link>
      </div>

      {/* Result banner */}
      {result && (
        <div className="card border-l-4 border-l-emerald-500">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            <div className="text-sm text-gray-900 dark:text-white">
              <span className="font-semibold">{result.units_created}</span> unidades creadas ·{' '}
              <span className="font-semibold">{result.contracts_created}</span> contratos generados
              {result.errors > 0 && (
                <> · <span className="text-red-400 font-semibold">{result.errors}</span> errores</>
              )}
            </div>
          </div>
          <button onClick={reset} className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
            Importar otro archivo
          </button>
        </div>
      )}

      {/* Upload zone */}
      {!result && parsedRows.length === 0 && (
        <>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`card cursor-pointer border-2 border-dashed transition-colors text-center py-16 ${
              dragOver
                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/10'
                : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'
            }`}
          >
            <Upload className="w-10 h-10 mx-auto text-gray-400 dark:text-gray-500 mb-4" />
            <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
              Arrastra un archivo CSV aquí o haz clic para seleccionar
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Formato: numero_unidad, piso, tipo, renta_mensual, inquilino_nombre, inquilino_tel, fecha_inicio, fecha_fin
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {headerError && (
            <div className="card border-l-4 border-l-red-500">
              <div className="flex items-center gap-2 text-sm text-red-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {headerError}
              </div>
            </div>
          )}

          {/* Template hint */}
          <div className="text-xs text-gray-500 dark:text-gray-400">
            <p className="font-medium mb-1">Ejemplo de CSV:</p>
            <pre className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 overflow-x-auto">
{`numero_unidad,piso,tipo,renta_mensual,inquilino_nombre,inquilino_tel,fecha_inicio,fecha_fin
101,1,LTR,8500,Juan Pérez,5512345678,2024-01-01,2025-01-01
102,1,MTR,12000,María López,5598765432,2024-03-15,2024-09-15
201,2,STR,3500,,,,`}
            </pre>
          </div>
        </>
      )}

      {/* Preview table */}
      {!result && parsedRows.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-5 h-5 text-gray-400" />
              <span className="text-sm text-gray-900 dark:text-white font-medium">{fileName}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {parsedRows.length} fila(s) · {validRows.length} válida(s)
                {errorRows.length > 0 && <span className="text-red-400"> · {errorRows.length} con errores</span>}
              </span>
            </div>
            <button onClick={reset} className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-400 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-header">
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Unidad</th>
                  <th className="px-3 py-2 text-left">Piso</th>
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-right">Renta</th>
                  <th className="px-3 py-2 text-left">Inquilino</th>
                  <th className="px-3 py-2 text-left">Teléfono</th>
                  <th className="px-3 py-2 text-left">Inicio</th>
                  <th className="px-3 py-2 text-left">Fin</th>
                  <th className="px-3 py-2 text-left">Estado</th>
                </tr>
              </thead>
              <tbody>
                {parsedRows.map((row) => (
                  <tr key={row.index} className={`table-row ${row.errors.length > 0 ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                    <td className="px-3 py-2 text-gray-400">{row.index + 1}</td>
                    <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{row.raw.numero_unidad || '—'}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{row.raw.piso || '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-medium ${VALID_TYPES.includes(row.raw.tipo?.toUpperCase()) ? 'text-gray-600 dark:text-gray-300' : 'text-red-400'}`}>
                        {row.raw.tipo?.toUpperCase() || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">
                      {row.raw.renta_mensual ? `$${Number(row.raw.renta_mensual).toLocaleString()}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{row.raw.inquilino_nombre || '—'}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{row.raw.inquilino_tel || '—'}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{row.raw.fecha_inicio || '—'}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{row.raw.fecha_fin || '—'}</td>
                    <td className="px-3 py-2">
                      {row.errors.length === 0 ? (
                        <span className="badge-active">OK</span>
                      ) : (
                        <span className="badge-late" title={row.errors.join(', ')}>
                          {row.errors.length} error(es)
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {errorRows.length > 0 && (
            <div className="card border-l-4 border-l-yellow-500 text-sm">
              <p className="font-medium text-gray-900 dark:text-white mb-2">Filas con errores (se omitirán):</p>
              <ul className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
                {errorRows.map(r => (
                  <li key={r.index}>Fila {r.index + 1}: {r.errors.join(', ')}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button onClick={reset} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors">
              Cancelar
            </button>
            <button
              onClick={handleImport}
              disabled={importing || validRows.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Importar {validRows.length} unidad(es)
            </button>
          </div>
        </>
      )}
    </div>
  )
}
