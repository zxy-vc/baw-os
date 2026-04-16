'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Copy, Check, Lock, Code2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const BASE_URL = 'https://baw-os.vercel.app'

interface Endpoint {
  method: 'GET' | 'POST' | 'PATCH'
  path: string
  description: string
  group: string
  params?: { name: string; type: string; required: boolean; description: string }[]
  body?: { name: string; type: string; required: boolean; description: string }[]
  curl: string
  response: string
}

const methodColors: Record<string, string> = {
  GET: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  POST: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  PATCH: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
}

const endpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/api/health',
    description: 'Verificar estado del sistema. Devuelve status y timestamp.',
    group: 'Sistema',
    curl: `curl -X GET "${BASE_URL}/api/health" \\
  -H "x-api-key: YOUR_API_KEY"`,
    response: `{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2026-04-02T12:00:00.000Z"
  }
}`,
  },
  {
    method: 'GET',
    path: '/api/units',
    description: 'Listar todas las unidades del edificio. Filtrar por status o tipo.',
    group: 'Unidades',
    params: [
      { name: 'status', type: 'string', required: false, description: 'Filtrar por estado: available, occupied, maintenance' },
      { name: 'type', type: 'string', required: false, description: 'Filtrar por tipo: apartment, studio, commercial, parking' },
    ],
    curl: `curl -X GET "${BASE_URL}/api/units?status=available" \\
  -H "x-api-key: YOUR_API_KEY"`,
    response: `{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "number": "101",
      "type": "apartment",
      "status": "available",
      "floor": 1,
      "area_m2": 65,
      "bedrooms": 2,
      "bathrooms": 1,
      "base_rent": 8500,
      "created_at": "2026-01-15T10:00:00.000Z"
    }
  ]
}`,
  },
  {
    method: 'GET',
    path: '/api/units/[id]',
    description: 'Obtener detalle completo de una unidad por su ID, incluyendo contrato activo e inquilino.',
    group: 'Unidades',
    curl: `curl -X GET "${BASE_URL}/api/units/UUID_HERE" \\
  -H "x-api-key: YOUR_API_KEY"`,
    response: `{
  "success": true,
  "data": {
    "id": "uuid",
    "number": "101",
    "type": "apartment",
    "status": "occupied",
    "contract": { "id": "uuid", "status": "active", "rent": 8500 },
    "occupant": { "id": "uuid", "name": "Juan Pérez", "email": "juan@email.com" }
  }
}`,
  },
  {
    method: 'POST',
    path: '/api/units',
    description: 'Crear una nueva unidad en el sistema.',
    group: 'Unidades',
    body: [
      { name: 'number', type: 'string', required: true, description: 'Número o identificador de la unidad' },
      { name: 'type', type: 'string', required: true, description: 'Tipo: apartment, studio, commercial, parking' },
      { name: 'floor', type: 'number', required: false, description: 'Piso de la unidad' },
      { name: 'area_m2', type: 'number', required: false, description: 'Área en metros cuadrados' },
      { name: 'bedrooms', type: 'number', required: false, description: 'Número de recámaras' },
      { name: 'bathrooms', type: 'number', required: false, description: 'Número de baños' },
      { name: 'base_rent', type: 'number', required: false, description: 'Renta base mensual en MXN' },
    ],
    curl: `curl -X POST "${BASE_URL}/api/units" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "number": "201",
    "type": "apartment",
    "floor": 2,
    "area_m2": 75,
    "bedrooms": 2,
    "bathrooms": 1,
    "base_rent": 9500
  }'`,
    response: `{
  "success": true,
  "data": {
    "id": "uuid",
    "number": "201",
    "type": "apartment",
    "status": "available",
    "floor": 2,
    "area_m2": 75,
    "base_rent": 9500
  }
}`,
  },
  {
    method: 'GET',
    path: '/api/contracts',
    description: 'Listar todos los contratos. Filtrar por status (active, overdue, expired, cancelled).',
    group: 'Contratos',
    params: [
      { name: 'status', type: 'string', required: false, description: 'Filtrar: active, overdue, expired, cancelled' },
    ],
    curl: `curl -X GET "${BASE_URL}/api/contracts?status=active" \\
  -H "x-api-key: YOUR_API_KEY"`,
    response: `{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "status": "active",
      "rent": 8500,
      "payment_day": 5,
      "start_date": "2026-01-01",
      "end_date": "2026-12-31",
      "unit": { "id": "uuid", "number": "101" },
      "occupant": { "id": "uuid", "name": "Juan Pérez" }
    }
  ]
}`,
  },
  {
    method: 'POST',
    path: '/api/contracts',
    description: 'Crear un nuevo contrato vinculando unidad e inquilino.',
    group: 'Contratos',
    body: [
      { name: 'unit_id', type: 'uuid', required: true, description: 'ID de la unidad' },
      { name: 'occupant_id', type: 'uuid', required: true, description: 'ID del inquilino' },
      { name: 'rent', type: 'number', required: true, description: 'Renta mensual en MXN' },
      { name: 'payment_day', type: 'number', required: false, description: 'Día de pago (1-31)' },
      { name: 'start_date', type: 'date', required: true, description: 'Fecha de inicio (YYYY-MM-DD)' },
      { name: 'end_date', type: 'date', required: true, description: 'Fecha de fin (YYYY-MM-DD)' },
      { name: 'deposit', type: 'number', required: false, description: 'Depósito en MXN' },
    ],
    curl: `curl -X POST "${BASE_URL}/api/contracts" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "unit_id": "uuid",
    "occupant_id": "uuid",
    "rent": 8500,
    "payment_day": 5,
    "start_date": "2026-01-01",
    "end_date": "2026-12-31"
  }'`,
    response: `{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "active",
    "rent": 8500,
    "unit": { "number": "101" },
    "occupant": { "name": "Juan Pérez" }
  }
}`,
  },
  {
    method: 'GET',
    path: '/api/contracts/overdue',
    description: 'Listar contratos activos en mora (pago vencido para el mes actual).',
    group: 'Contratos',
    curl: `curl -X GET "${BASE_URL}/api/contracts/overdue" \\
  -H "x-api-key: YOUR_API_KEY"`,
    response: `{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "status": "active",
      "rent": 8500,
      "payment_day": 5,
      "unit": { "number": "101" },
      "occupant": { "name": "Juan Pérez" }
    }
  ]
}`,
  },
  {
    method: 'GET',
    path: '/api/payments',
    description: 'Obtener todos los pagos del mes actual, con detalle de contrato, unidad e inquilino.',
    group: 'Pagos',
    curl: `curl -X GET "${BASE_URL}/api/payments" \\
  -H "x-api-key: YOUR_API_KEY"`,
    response: `{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "amount": 8500,
      "amount_paid": 8500,
      "status": "paid",
      "method": "transfer",
      "due_date": "2026-04-05",
      "paid_date": "2026-04-03",
      "contract": {
        "id": "uuid",
        "unit": { "number": "101" },
        "occupant": { "name": "Juan Pérez" }
      }
    }
  ]
}`,
  },
  {
    method: 'POST',
    path: '/api/payments',
    description: 'Registrar un nuevo pago para un contrato.',
    group: 'Pagos',
    body: [
      { name: 'contract_id', type: 'uuid', required: true, description: 'ID del contrato' },
      { name: 'amount', type: 'number', required: true, description: 'Monto del pago en MXN' },
      { name: 'method', type: 'string', required: false, description: 'Método: transfer, cash, card, check (default: transfer)' },
      { name: 'reference', type: 'string', required: false, description: 'Referencia o número de transacción' },
    ],
    curl: `curl -X POST "${BASE_URL}/api/payments" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "contract_id": "uuid",
    "amount": 8500,
    "method": "transfer",
    "reference": "REF-20260402"
  }'`,
    response: `{
  "success": true,
  "data": {
    "id": "uuid",
    "amount": 8500,
    "status": "paid",
    "method": "transfer",
    "paid_date": "2026-04-02"
  }
}`,
  },
  {
    method: 'GET',
    path: '/api/contacts',
    description: 'Listar contactos (inquilinos, proveedores, etc). Buscar por nombre o email.',
    group: 'Contactos',
    params: [
      { name: 'type', type: 'string', required: false, description: 'Filtrar por tipo de contacto' },
      { name: 'search', type: 'string', required: false, description: 'Buscar por nombre, email o teléfono' },
    ],
    curl: `curl -X GET "${BASE_URL}/api/contacts?search=juan" \\
  -H "x-api-key: YOUR_API_KEY"`,
    response: `{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Juan Pérez",
      "email": "juan@email.com",
      "phone": "+52 55 1234 5678",
      "type": "tenant"
    }
  ]
}`,
  },
  {
    method: 'POST',
    path: '/api/contacts',
    description: 'Crear un nuevo contacto en el directorio.',
    group: 'Contactos',
    body: [
      { name: 'name', type: 'string', required: true, description: 'Nombre completo' },
      { name: 'email', type: 'string', required: false, description: 'Correo electrónico' },
      { name: 'phone', type: 'string', required: false, description: 'Teléfono' },
      { name: 'type', type: 'string', required: false, description: 'Tipo: tenant, vendor, owner, other' },
    ],
    curl: `curl -X POST "${BASE_URL}/api/contacts" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "María López",
    "email": "maria@email.com",
    "phone": "+52 55 9876 5432",
    "type": "tenant"
  }'`,
    response: `{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "María López",
    "email": "maria@email.com",
    "type": "tenant"
  }
}`,
  },
  {
    method: 'GET',
    path: '/api/reservations',
    description: 'Listar todas las reservaciones de amenidades.',
    group: 'Reservaciones',
    curl: `curl -X GET "${BASE_URL}/api/reservations" \\
  -H "x-api-key: YOUR_API_KEY"`,
    response: `{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "amenity": "roof_garden",
      "date": "2026-04-10",
      "time_start": "14:00",
      "time_end": "18:00",
      "occupant": { "name": "Juan Pérez" },
      "status": "confirmed"
    }
  ]
}`,
  },
  {
    method: 'POST',
    path: '/api/reservations',
    description: 'Crear una nueva reservación de amenidad.',
    group: 'Reservaciones',
    body: [
      { name: 'occupant_id', type: 'uuid', required: true, description: 'ID del inquilino' },
      { name: 'amenity', type: 'string', required: true, description: 'Amenidad: roof_garden, gym, pool, event_room' },
      { name: 'date', type: 'date', required: true, description: 'Fecha (YYYY-MM-DD)' },
      { name: 'time_start', type: 'string', required: true, description: 'Hora de inicio (HH:MM)' },
      { name: 'time_end', type: 'string', required: true, description: 'Hora de fin (HH:MM)' },
    ],
    curl: `curl -X POST "${BASE_URL}/api/reservations" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "occupant_id": "uuid",
    "amenity": "roof_garden",
    "date": "2026-04-10",
    "time_start": "14:00",
    "time_end": "18:00"
  }'`,
    response: `{
  "success": true,
  "data": {
    "id": "uuid",
    "amenity": "roof_garden",
    "date": "2026-04-10",
    "status": "confirmed"
  }
}`,
  },
  {
    method: 'GET',
    path: '/api/incidents',
    description: 'Listar incidencias de mantenimiento. Filtrar por status y prioridad.',
    group: 'Incidencias',
    params: [
      { name: 'status', type: 'string', required: false, description: 'Filtrar: open, in_progress, resolved, closed' },
      { name: 'priority', type: 'string', required: false, description: 'Filtrar: low, medium, high, critical' },
    ],
    curl: `curl -X GET "${BASE_URL}/api/incidents?status=open&priority=high" \\
  -H "x-api-key: YOUR_API_KEY"`,
    response: `{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Fuga de agua en baño",
      "description": "Fuga debajo del lavabo",
      "status": "open",
      "priority": "high",
      "unit": { "number": "301", "type": "apartment" },
      "created_at": "2026-04-01T09:30:00.000Z"
    }
  ]
}`,
  },
  {
    method: 'POST',
    path: '/api/incidents',
    description: 'Reportar una nueva incidencia de mantenimiento.',
    group: 'Incidencias',
    body: [
      { name: 'title', type: 'string', required: true, description: 'Título de la incidencia' },
      { name: 'description', type: 'string', required: false, description: 'Descripción detallada' },
      { name: 'unit_id', type: 'uuid', required: true, description: 'ID de la unidad afectada' },
      { name: 'priority', type: 'string', required: false, description: 'Prioridad: low, medium, high, critical' },
      { name: 'category', type: 'string', required: false, description: 'Categoría: plumbing, electrical, structural, etc.' },
    ],
    curl: `curl -X POST "${BASE_URL}/api/incidents" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Fuga de agua en baño",
    "description": "Fuga debajo del lavabo del baño principal",
    "unit_id": "uuid",
    "priority": "high",
    "category": "plumbing"
  }'`,
    response: `{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Fuga de agua en baño",
    "status": "open",
    "priority": "high"
  }
}`,
  },
  {
    method: 'GET',
    path: '/api/gastos',
    description: 'Obtener gastos operativos del mes actual.',
    group: 'Gastos',
    curl: `curl -X GET "${BASE_URL}/api/gastos" \\
  -H "x-api-key: YOUR_API_KEY"`,
    response: `{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "concept": "Mantenimiento elevador",
      "amount": 3500,
      "category": "maintenance",
      "date": "2026-04-01",
      "vendor": "Elevadores MX",
      "status": "paid"
    }
  ]
}`,
  },
  {
    method: 'POST',
    path: '/api/gastos',
    description: 'Registrar un nuevo gasto operativo.',
    group: 'Gastos',
    body: [
      { name: 'concept', type: 'string', required: true, description: 'Concepto del gasto' },
      { name: 'amount', type: 'number', required: true, description: 'Monto en MXN' },
      { name: 'category', type: 'string', required: false, description: 'Categoría: maintenance, utilities, admin, other' },
      { name: 'vendor', type: 'string', required: false, description: 'Proveedor' },
      { name: 'date', type: 'date', required: false, description: 'Fecha del gasto (YYYY-MM-DD)' },
    ],
    curl: `curl -X POST "${BASE_URL}/api/gastos" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "concept": "Servicio de limpieza",
    "amount": 4200,
    "category": "maintenance",
    "vendor": "Limpieza Pro"
  }'`,
    response: `{
  "success": true,
  "data": {
    "id": "uuid",
    "concept": "Servicio de limpieza",
    "amount": 4200,
    "status": "pending"
  }
}`,
  },
]

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className="p-1.5 rounded-md text-gray-500 hover:text-gray-300 hover:bg-gray-700/50 transition-colors"
      title="Copiar"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

function EndpointCard({ endpoint }: { endpoint: Endpoint }) {
  const [showCurl, setShowCurl] = useState(false)
  const [showResponse, setShowResponse] = useState(false)

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 [html.light_&]:bg-white [html.light_&]:border-gray-200 overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <span className={cn(
            'px-2.5 py-1 rounded-md text-xs font-bold border shrink-0 font-mono',
            methodColors[endpoint.method]
          )}>
            {endpoint.method}
          </span>
          <div className="flex-1 min-w-0">
            <code className="text-sm font-mono text-gray-200 [html.light_&]:text-gray-800 break-all">
              {endpoint.path}
            </code>
            <p className="text-sm text-gray-400 [html.light_&]:text-gray-500 mt-1">
              {endpoint.description}
            </p>
          </div>
          <div className="flex items-center gap-1 text-xs text-amber-400/80 shrink-0">
            <Lock className="w-3 h-3" />
            <span>API Key</span>
          </div>
        </div>

        {endpoint.params && endpoint.params.length > 0 && (
          <div className="mt-4">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Query Parameters</h4>
            <div className="space-y-1.5">
              {endpoint.params.map(p => (
                <div key={p.name} className="flex items-baseline gap-2 text-sm">
                  <code className="text-indigo-400 font-mono text-xs">{p.name}</code>
                  <span className="text-gray-600 text-xs">{p.type}</span>
                  {p.required && <span className="text-red-400 text-[10px] font-bold">REQ</span>}
                  <span className="text-gray-500 text-xs">— {p.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {endpoint.body && endpoint.body.length > 0 && (
          <div className="mt-4">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Request Body (JSON)</h4>
            <div className="space-y-1.5">
              {endpoint.body.map(p => (
                <div key={p.name} className="flex items-baseline gap-2 text-sm">
                  <code className="text-indigo-400 font-mono text-xs">{p.name}</code>
                  <span className="text-gray-600 text-xs">{p.type}</span>
                  {p.required && <span className="text-red-400 text-[10px] font-bold">REQ</span>}
                  <span className="text-gray-500 text-xs">— {p.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-gray-800/50 [html.light_&]:border-gray-100">
        <button
          onClick={() => setShowCurl(!showCurl)}
          className="flex items-center gap-2 w-full px-4 py-2.5 text-xs font-medium text-gray-400 hover:text-gray-200 [html.light_&]:text-gray-500 [html.light_&]:hover:text-gray-700 transition-colors"
        >
          {showCurl ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          Ejemplo cURL
        </button>
        {showCurl && (
          <div className="px-4 pb-3">
            <div className="relative rounded-lg bg-gray-950 [html.light_&]:bg-gray-50 p-3 overflow-x-auto">
              <div className="absolute top-2 right-2">
                <CopyButton text={endpoint.curl} />
              </div>
              <pre className="text-xs font-mono text-green-400 [html.light_&]:text-green-700 whitespace-pre-wrap pr-8">
                {endpoint.curl}
              </pre>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-gray-800/50 [html.light_&]:border-gray-100">
        <button
          onClick={() => setShowResponse(!showResponse)}
          className="flex items-center gap-2 w-full px-4 py-2.5 text-xs font-medium text-gray-400 hover:text-gray-200 [html.light_&]:text-gray-500 [html.light_&]:hover:text-gray-700 transition-colors"
        >
          {showResponse ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          Ejemplo Response
        </button>
        {showResponse && (
          <div className="px-4 pb-3">
            <div className="relative rounded-lg bg-gray-950 [html.light_&]:bg-gray-50 p-3 overflow-x-auto">
              <div className="absolute top-2 right-2">
                <CopyButton text={endpoint.response} />
              </div>
              <pre className="text-xs font-mono text-amber-300 [html.light_&]:text-amber-700 whitespace-pre-wrap pr-8">
                {endpoint.response}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ApiDocsPage() {
  const groups = Array.from(new Set(endpoints.map(e => e.group)))

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-indigo-600/20 border border-indigo-500/30">
            <Code2 className="w-5 h-5 text-indigo-400" />
          </div>
          <h1 className="text-2xl font-bold page-title">
            API Documentation
          </h1>
        </div>
        <p className="text-sm page-subtitle mt-2">
          BaW OS REST API — {endpoints.length} endpoints disponibles
        </p>
      </div>

      {/* Auth section */}
      <div className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Lock className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-semibold text-amber-400">Autenticación</h2>
        </div>
        <p className="text-sm text-gray-400 [html.light_&]:text-gray-600">
          Todos los endpoints requieren un API Key enviado en el header <code className="px-1.5 py-0.5 rounded bg-gray-800 [html.light_&]:bg-gray-100 font-mono text-xs text-amber-300 [html.light_&]:text-amber-700">x-api-key</code>.
        </p>
        <div className="mt-3 rounded-lg bg-gray-950 [html.light_&]:bg-gray-50 p-3">
          <pre className="text-xs font-mono text-gray-300 [html.light_&]:text-gray-700">
{`curl -H "x-api-key: YOUR_API_KEY" \\
     ${BASE_URL}/api/health`}
          </pre>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Base URL: <code className="font-mono text-indigo-400">{BASE_URL}</code>
        </p>
      </div>

      {/* Response format */}
      <div className="mb-8 rounded-xl border border-gray-800 [html.light_&]:border-gray-200 bg-gray-900/40 [html.light_&]:bg-gray-50 p-4">
        <h2 className="text-sm font-semibold text-gray-300 [html.light_&]:text-gray-700 mb-2">Formato de respuesta</h2>
        <div className="rounded-lg bg-gray-950 [html.light_&]:bg-white p-3">
          <pre className="text-xs font-mono text-gray-300 [html.light_&]:text-gray-600">{`{
  "success": true | false,
  "data": T | null,
  "error": string | null
}`}</pre>
        </div>
      </div>

      {/* Endpoints by group */}
      {groups.map(group => (
        <div key={group} className="mb-10">
          <h2 className="text-lg font-bold section-title mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            {group}
          </h2>
          <div className="space-y-4">
            {endpoints
              .filter(e => e.group === group)
              .map((endpoint, i) => (
                <EndpointCard key={`${endpoint.method}-${endpoint.path}-${i}`} endpoint={endpoint} />
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}
