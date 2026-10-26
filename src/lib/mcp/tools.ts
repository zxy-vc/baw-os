// BaW OS — Catálogo de tools MCP (BAW-11)
//
// Cada tool envuelve UN handler v1 existente (src/app/api/v1/*). La tool no
// tiene lógica propia: el puente (./server.ts) llama al núcleo de la ruta v1
// (`GET/POST.withAuth`) con la identidad ya autenticada, así que REST y MCP
// pasan por el mismo v1Read/v1Write → scopes, idempotencia, clasificador
// AUTO/LOG/REQUIRE_APPROVAL, agent_approvals y agent_actions.
//
// `scope` replica el scope que exige la ruta v1. Sirve para filtrar tools/list;
// `withAuth` vuelve a validar los scopes de la ruta en cada llamada.
//
// Fuera de este catálogo a propósito: acciones con candado duro del
// clasificador (payment.charge/refund, cfdi.emit, contract.sign/terminate,
// policy.modify), resolver aprobaciones (solo Fran), agents:run, lifecycle y
// altas de unidades/contratos/reservaciones.

import { z, type ZodRawShape } from 'zod'
import type { V1Route } from '@/lib/agents/v1/handler'
import * as unitsRoute from '@/app/api/v1/units/route'
import * as contractsRoute from '@/app/api/v1/contracts/route'
import * as occupantsRoute from '@/app/api/v1/occupants/route'
import * as paymentsRoute from '@/app/api/v1/payments/route'
import * as incidentsRoute from '@/app/api/v1/incidents/route'
import * as tasksRoute from '@/app/api/v1/tasks/route'
import * as insightsSummaryRoute from '@/app/api/v1/insights/summary/route'
import * as runsRoute from '@/app/api/v1/runs/route'
import * as approvalsRoute from '@/app/api/v1/approvals/route'
import * as approvalDetailRoute from '@/app/api/v1/approvals/[id]/route'
import * as messagesRoute from '@/app/api/v1/messages/route'

export interface McpToolDef {
  name: string
  title: string
  description: string
  /** Scope que exige la ruta v1 envuelta. */
  scope: string
  kind: 'read' | 'write'
  inputShape: ZodRawShape
  method: 'GET' | 'POST'
  /** Ruta v1 (para el NextRequest interno; algunas rutas leen el id del path). */
  path: (args: Record<string, unknown>) => string
  handler: V1Route
  /** Solo writes: arma el body v1 a partir de los argumentos de la tool. */
  toBody?: (args: Record<string, unknown>) => Record<string, unknown>
  /** Solo writes: frase de éxito («Incidencia creada»). */
  doneLabel?: string
}

// ── Argumentos compartidos ───────────────────────────────────────────────────

const uuid = (what: string) => z.string().uuid().describe(`ID (uuid) de ${what}.`)

const pageArgs = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe('Cuántos registros traer (1-200, default 50).'),
  cursor: z
    .string()
    .max(500)
    .optional()
    .describe('Cursor de la página siguiente (pagination.next_cursor de la respuesta anterior).'),
}

const writeArgs = {
  idempotency_key: z
    .string()
    .regex(/^[A-Za-z0-9._:-]{1,200}$/, 'Solo letras sin acento, números y . _ : - (máx. 200).')
    .optional()
    .describe(
      'Clave única por intento. Si repites la llamada con la misma clave y los mismos datos, no se duplica.'
    ),
  motivo: z
    .string()
    .max(500)
    .optional()
    .describe('Por qué haces esta acción. Fran lo ve si la acción queda pendiente de aprobación.'),
}

const fecha = (what: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe(`${what} (AAAA-MM-DD).`)

/** Quita los argumentos de transporte; el resto se manda tal cual como body v1. */
function bodyFrom(args: Record<string, unknown>): Record<string, unknown> {
  const { idempotency_key: _k, motivo: _m, ...rest } = args
  return rest
}

// ── Catálogo ─────────────────────────────────────────────────────────────────

export const MCP_TOOLS: McpToolDef[] = [
  // Lectura
  {
    name: 'listar_unidades',
    title: 'Listar unidades',
    description:
      'Lista los departamentos/locales de la organización con su estado (disponible, ocupada, mantenimiento…), piso, tipo de renta y metros.',
    scope: 'units:read',
    kind: 'read',
    inputShape: {
      status: z
        .enum(['available', 'occupied', 'maintenance', 'reserved', 'inactive'])
        .optional()
        .describe('Filtra por estado de la unidad.'),
      ...pageArgs,
    },
    method: 'GET',
    path: () => '/api/v1/units',
    handler: unitsRoute.GET,
  },
  {
    name: 'listar_contratos',
    title: 'Listar contratos',
    description:
      'Lista los contratos de renta: unidad, inquilino, fechas, renta mensual, depósito, día de pago y estado.',
    scope: 'contracts:read',
    kind: 'read',
    inputShape: {
      status: z.string().max(40).optional().describe('Filtra por estado (p.ej. active, terminated).'),
      unit_id: uuid('la unidad').optional(),
      occupant_id: uuid('el inquilino').optional(),
      ...pageArgs,
    },
    method: 'GET',
    path: () => '/api/v1/contracts',
    handler: contractsRoute.GET,
  },
  {
    name: 'listar_ocupantes',
    title: 'Listar inquilinos y huéspedes',
    description:
      'Lista inquilinos, huéspedes y contactos de la organización con teléfono, correo y datos de facturación.',
    scope: 'occupants:read',
    kind: 'read',
    inputShape: {
      type: z
        .enum(['ltr', 'str', 'both'])
        .optional()
        .describe('ltr = renta larga, str = estancia corta, both = ambos.'),
      ...pageArgs,
    },
    method: 'GET',
    path: () => '/api/v1/occupants',
    handler: occupantsRoute.GET,
  },
  {
    name: 'listar_pagos',
    title: 'Listar pagos y cargos',
    description:
      'Lista los cargos de renta con monto, monto pagado, vencimiento y estado. Úsala para saber cuánto se debe: filtra por status (pending, overdue, partial) o por contrato; lo debido de cada cargo es amount − amount_paid. Los cargos void están anulados y NO se deben.',
    scope: 'payments:read',
    kind: 'read',
    inputShape: {
      status: z
        .string()
        .max(40)
        .optional()
        .describe('Filtra por estado (p.ej. pending, overdue, partial, paid; void = anulado).'),
      contract_id: uuid('el contrato').optional(),
      due_from: fecha('Vence desde').optional(),
      due_to: fecha('Vence hasta').optional(),
      ...pageArgs,
    },
    method: 'GET',
    path: () => '/api/v1/payments',
    handler: paymentsRoute.GET,
  },
  {
    name: 'listar_incidencias',
    title: 'Listar incidencias',
    description: 'Lista incidencias de mantenimiento con prioridad, estado, unidad y costos.',
    scope: 'incidents:read',
    kind: 'read',
    inputShape: {
      status: z.string().max(40).optional().describe('Filtra por estado (p.ej. open, resolved).'),
      priority: z.enum(['urgent', 'high', 'normal', 'low']).optional().describe('Filtra por prioridad.'),
      unit_id: uuid('la unidad').optional(),
      ...pageArgs,
    },
    method: 'GET',
    path: () => '/api/v1/incidents',
    handler: incidentsRoute.GET,
  },
  {
    name: 'listar_tareas',
    title: 'Listar tareas',
    description: 'Lista tareas operativas con estado, prioridad, responsable y fecha límite.',
    scope: 'tasks:read',
    kind: 'read',
    inputShape: {
      status: z.string().max(40).optional().describe('Filtra por estado (p.ej. pending, done).'),
      priority: z.enum(['urgent', 'normal', 'low']).optional().describe('Filtra por prioridad.'),
      assigned_to: z.string().max(200).optional().describe('Filtra por responsable.'),
      ...pageArgs,
    },
    method: 'GET',
    path: () => '/api/v1/tasks',
    handler: tasksRoute.GET,
  },
  {
    name: 'resumen_operativo',
    title: 'Resumen operativo',
    description:
      'Foto rápida de la organización: unidades por estado, contratos activos, pagos por estado con totales, incidencias abiertas por prioridad y tareas por estado. Buen primer paso para «¿cuánto me deben?»: lo pendiente está en pending, overdue y partial (en partial resta amount_paid con listar_pagos); paid ya se cobró y void está anulado.',
    scope: 'insights:read',
    kind: 'read',
    inputShape: {},
    method: 'GET',
    path: () => '/api/v1/insights/summary',
    handler: insightsSummaryRoute.GET,
  },
  {
    name: 'listar_ejecuciones',
    title: 'Listar ejecuciones de agentes',
    description: 'Lista las ejecuciones (runs) de los agentes en la organización, con estado, duración y error.',
    scope: 'runs:read',
    kind: 'read',
    inputShape: {
      agent_id: z.string().max(60).optional().describe('Filtra por agente (p.ej. grok-bot, alicia-ops).'),
      status: z.string().max(40).optional().describe('Filtra por estado (running, succeeded, failed…).'),
      ...pageArgs,
    },
    method: 'GET',
    path: () => '/api/v1/runs',
    handler: runsRoute.GET,
  },
  {
    name: 'listar_aprobaciones',
    title: 'Listar aprobaciones',
    description:
      'Lista las acciones que esperan (o ya tuvieron) aprobación de Fran. Por defecto solo las pendientes.',
    scope: 'approvals:read',
    kind: 'read',
    inputShape: {
      status: z
        .string()
        .max(40)
        .optional()
        .describe('pending (default), granted, denied, expired o all.'),
      agent_id: z.string().max(60).optional().describe('Filtra por agente.'),
      ...pageArgs,
    },
    method: 'GET',
    path: () => '/api/v1/approvals',
    handler: approvalsRoute.GET,
  },
  {
    name: 'ver_aprobacion',
    title: 'Ver una aprobación',
    description:
      'Consulta el estado de una acción pendiente de aprobación (por su id) para saber si Fran ya la aprobó o la rechazó.',
    scope: 'approvals:read',
    kind: 'read',
    inputShape: { approval_id: uuid('la aprobación') },
    method: 'GET',
    path: (args) => `/api/v1/approvals/${encodeURIComponent(String(args.approval_id))}`,
    handler: approvalDetailRoute.GET,
  },

  // Escritura — todas pasan por v1Write (clasificador + auditoría).
  {
    name: 'crear_incidencia',
    title: 'Crear incidencia',
    description: 'Reporta una incidencia de mantenimiento (fuga, falla eléctrica, etc.), opcionalmente ligada a una unidad.',
    scope: 'incidents:write',
    kind: 'write',
    inputShape: {
      title: z.string().min(1).max(200).describe('Título corto de la incidencia.'),
      description: z.string().max(4000).optional().describe('Detalle de lo que pasa.'),
      unit_id: uuid('la unidad afectada').optional(),
      priority: z.enum(['urgent', 'high', 'normal', 'low']).optional().describe('Prioridad (default normal).'),
      estimated_cost: z.number().nonnegative().optional().describe('Costo estimado en MXN.'),
      ...writeArgs,
    },
    method: 'POST',
    path: () => '/api/v1/incidents',
    handler: incidentsRoute.POST,
    toBody: bodyFrom,
    doneLabel: 'Incidencia creada',
  },
  {
    name: 'crear_tarea',
    title: 'Crear tarea',
    description: 'Crea una tarea operativa con responsable, prioridad y fecha límite opcionales.',
    scope: 'tasks:write',
    kind: 'write',
    inputShape: {
      title: z.string().min(1).max(200).describe('Qué hay que hacer.'),
      description: z.string().max(4000).optional().describe('Detalle.'),
      assigned_to: z.string().max(200).optional().describe('Responsable.'),
      entity_type: z.string().max(60).optional().describe('Tipo de registro relacionado (p.ej. unit, contract).'),
      entity_id: z.string().max(100).optional().describe('ID del registro relacionado.'),
      due_date: fecha('Fecha límite').optional(),
      priority: z.enum(['urgent', 'normal', 'low']).optional().describe('Prioridad (default normal).'),
      ...writeArgs,
    },
    method: 'POST',
    path: () => '/api/v1/tasks',
    handler: tasksRoute.POST,
    toBody: bodyFrom,
    doneLabel: 'Tarea creada',
  },
  {
    name: 'registrar_pago_recibido',
    title: 'Registrar pago recibido',
    description:
      'Registra en la contabilidad un pago que YA se recibió (efectivo o transferencia) contra un contrato. No cobra ninguna tarjeta ni mueve dinero.',
    scope: 'payments:write',
    kind: 'write',
    inputShape: {
      contract_id: uuid('el contrato'),
      amount: z.number().positive().describe('Monto recibido en MXN.'),
      method: z.string().max(40).optional().describe('Método (p.ej. transfer, cash). Default transfer.'),
      reference: z.string().max(200).optional().describe('Referencia o folio de la transferencia.'),
      paid_date: fecha('Fecha en que se recibió').optional(),
      due_date: fecha('Vencimiento del cargo que se paga').optional(),
      notes: z.string().max(2000).optional().describe('Notas.'),
      ...writeArgs,
    },
    method: 'POST',
    path: () => '/api/v1/payments',
    handler: paymentsRoute.POST,
    toBody: bodyFrom,
    doneLabel: 'Pago registrado',
  },
  {
    name: 'crear_ocupante',
    title: 'Dar de alta inquilino o huésped',
    description: 'Da de alta un inquilino, huésped o contacto con sus datos de contacto y, si aplica, de facturación.',
    scope: 'occupants:write',
    kind: 'write',
    inputShape: {
      name: z.string().min(1).max(200).describe('Nombre completo.'),
      phone: z.string().max(40).optional().describe('Teléfono (con lada).'),
      email: z.string().email().max(200).optional().describe('Correo.'),
      type: z.enum(['ltr', 'str', 'both']).optional().describe('ltr = renta larga, str = estancia corta.'),
      notes: z.string().max(2000).optional().describe('Notas.'),
      rfc: z.string().max(20).optional().describe('RFC para facturar.'),
      razon_social: z.string().max(300).optional().describe('Razón social.'),
      regimen_fiscal: z.string().max(10).optional().describe('Clave de régimen fiscal SAT.'),
      cp_fiscal: z.string().max(10).optional().describe('Código postal fiscal.'),
      email_factura: z.string().email().max(200).optional().describe('Correo para facturas.'),
      requiere_factura: z.boolean().optional().describe('¿Requiere factura?'),
      ...writeArgs,
    },
    method: 'POST',
    path: () => '/api/v1/occupants',
    handler: occupantsRoute.POST,
    toBody: bodyFrom,
    doneLabel: 'Inquilino dado de alta',
  },
  {
    name: 'enviar_mensaje_inquilino',
    title: 'Enviar mensaje a inquilino',
    description:
      'Prepara un mensaje para un inquilino por WhatsApp, correo o SMS. Queda pendiente de aprobación de Fran antes de salir, salvo que las políticas del agente lo permitan.',
    scope: 'messages:send',
    kind: 'write',
    inputShape: {
      channel: z.enum(['whatsapp', 'email', 'sms']).describe('Canal.'),
      to: z.string().min(1).max(200).describe('Teléfono o correo del inquilino.'),
      subject: z.string().max(200).optional().describe('Asunto (solo correo).'),
      body: z.string().min(1).max(4000).describe('Texto del mensaje.'),
      ...writeArgs,
    },
    method: 'POST',
    path: () => '/api/v1/messages',
    handler: messagesRoute.POST,
    // Siempre a inquilino: la tool nunca manda audience=internal.
    toBody: (args) => ({ ...bodyFrom(args), audience: 'tenant' }),
    doneLabel: 'Mensaje encolado',
  },
]

/** Misma regla que authenticateAgentRequest: el scope exacto o el comodín '*'. */
export function hasScope(granted: string[], scope: string): boolean {
  return granted.includes(scope) || granted.includes('*')
}

export function toolsForScopes(granted: string[]): McpToolDef[] {
  return MCP_TOOLS.filter((t) => hasScope(granted, t.scope))
}
