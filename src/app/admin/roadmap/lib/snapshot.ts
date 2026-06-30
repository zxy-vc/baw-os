// BaW OS — Roadmap snapshot data
// v1: estructura desde HTML mock 2026-05-01 (Notion: Internal Roadmap Dashboard)
// v2 (futuro): fetchNotionBoard() + fetchGithubData() con ISR revalidate=300
//
// La spec en Notion (354169373e7281e7b4eef78ea5031e47) describe:
//   - Features → Notion data source 330169373e7281e5b93beda50203b65f
//   - Sprints recorridos → GitHub PRs mergeados
//   - Deuda activa → GitHub issues abiertos
//
// AUDITORÍA 2026-06-30 (Claude Code): el snapshot llevaba 2 meses congelado en el
// cierre de Sprint 4 (2026-05-01). Se verificó contra `git log --merges` (PRs
// #28-#131) cuáles items de la deuda Sprint 5 quedaron resueltos, y se agregaron
// los Sprints 6-8 que nunca se registraron aquí (agentes terceros, lifecycle,
// chat, y el bloque más grande: el modelo de Personas/CRM/Estancias + la
// revisión de Finanzas/Cobros). Las Tiers T1-T5 vienen de la taxonomía original
// de Notion; se actualizaron done/backlog donde se verificó el cambio real, sin
// inventar precisión que no se puede verificar para trabajo nuevo no catalogado
// ahí — ese trabajo se registra en los Sprints (fuente más confiable: PRs).
//
// Por ahora servimos el snapshot canónico para que el dashboard exista.
// El snapshot es editable por L0 vía este archivo hasta que llegue v2.

export type Status = 'done' | 'doing' | 'backlog' | 'discarded'
export type Tier = 't1' | 't2' | 't25' | 't3' | 't4' | 't5'
export type SprintStatus = 'done' | 'next' | 'future'

export interface SprintItem {
  num: string  // "UX", "Core", "#14", "Deuda"
  text: string
}

export interface Sprint {
  name: string
  status: SprintStatus
  statusLabel?: string  // override: "Done · 5 PRs", "Siguiente"
  items: SprintItem[]
}

export interface KanbanCard {
  tier: Tier
  tierLabel: string  // "T1 MVP", "T2 Core"
  text: string
}

export interface KanbanCol {
  name: string
  emoji: string
  count: number
  cards: KanbanCard[]
  footer?: string  // "Próximo a entrar..."
}

export interface TierBox {
  tier: Tier
  name: string
  total: number
  done: number
  doing?: number
  backlog: number
  discarded?: number
  items: { text: string; status?: Status }[]
  fullWidth?: boolean
  twoCols?: boolean
}

export interface RoadmapSnapshot {
  asOf: string
  totals: { total: number; done: number; doing: number; backlog: number; discarded: number }
  sprints: Sprint[]
  kanban: KanbanCol[]
  tiers: TierBox[]
  nextUp: { id: string; text: string; reason: string }[]
}

export const ROADMAP_SNAPSHOT: RoadmapSnapshot = {
  asOf: '2026-06-30 · Auditoría post Sprint 8 (CRM/Personas + Finanzas)',
  totals: { total: 102, done: 55, doing: 1, backlog: 41, discarded: 5 },

  sprints: [
    {
      name: 'Sprint 1-2', status: 'done',
      items: [
        { num: 'UX', text: 'Skeletons + Empty states + Toast + Modals' },
        { num: 'UX', text: 'Sidebar v2 + paleta Vercel' },
        { num: 'PWA', text: 'Vista Conserje (PIN + deptos + cobros)' },
      ],
    },
    {
      name: 'Sprint 3', status: 'done',
      items: [
        { num: 'Core', text: 'Webhooks + Notificaciones in-app' },
        { num: 'Core', text: 'API Docs (17 endpoints)' },
        { num: 'Core', text: 'Multi-tenant base' },
        { num: 'Core', text: 'Stripe checkout + webhook' },
        { num: 'Core', text: 'Channex channel manager' },
        { num: 'Core', text: 'Mora 5 niveles + Cotizador STR' },
      ],
    },
    {
      name: 'Sprint 4', status: 'done', statusLabel: 'Done · 5 PRs',
      items: [
        { num: '#14', text: 'S4-0 Sidebar 6 secciones + SectionTopNav' },
        { num: '#15', text: 'S4-1 Refactor multi-tenant resolveOrgId()' },
        { num: '#16', text: 'S4-1.5 Platform Admin /admin + 3 capas L0/L1/L2' },
        { num: '#17', text: 'S4-2 Owner Portal v2 con login real' },
        { num: '#18', text: 'S4-3 Agente Cobranza v1 + infra 10+1' },
        { num: '#27', text: 'Hardening: AGENTS.md + PR template' },
      ],
    },
    {
      name: 'Sprint 5', status: 'done', statusLabel: 'Done · deuda Sprint 4 cerrada',
      items: [
        { num: '#20', text: 'conserje /[orgSlug] — multi-tenant real (antes UUID hardcoded)' },
        { num: '#22', text: 'webhooks externos → resolveOrgIdForWebhook() (reemplaza shim getOrgIdAsync)' },
        { num: '#25', text: 'deprecar OWNER_TOKEN legacy compartido' },
        { num: '#19', text: '/admin redirige a /login (no a /)' },
        { num: '#21', text: '/apply public_prefix con ruta correcta' },
        { num: '#24', text: 'migrar HEX/rgba hardcoded → tokens BaW (queda HEX solo donde es técnicamente necesario: PDFs, OG images)' },
      ],
    },
    {
      name: 'Sprint 6', status: 'done', statusLabel: 'Done · Agentes terceros + Booking público',
      items: [
        { num: 'Agents', text: 'Agent Platform v1 API (bearer auth, scopes, idempotencia, paginación)' },
        { num: 'Agents', text: 'Alicia + Hugo conectados vía Discord (pivote: terceros sobre OpenClaw, no el catálogo nativo 10+1 originalmente planeado)' },
        { num: 'Booking', text: 'Sitio público 809 + reservaciones online (ADR-019/020, brand 809)' },
        { num: 'Infra', text: 'CI GitHub Actions + fix submodule design tokens en Vercel' },
      ],
    },
    {
      name: 'Sprint 7', status: 'done', statusLabel: 'Done · Lifecycle + Chat',
      items: [
        { num: 'Lifecycle', text: 'Archivar/Restaurar/Eliminar uniforme + force-delete (edificios, unidades, contratos, inquilinos, agentes)' },
        { num: 'Chat', text: 'Chat in-app con agentes conectados (dock lateral, identidad de agente, reusa agent_interactions)' },
        { num: 'Agents', text: 'Catálogo de agentes editable en self-servicio (Platform Admin)' },
        { num: 'Nav', text: 'Reorden navegación (Hoy, Portafolio, Inquilinos) + quitar toggle Human/Agent confuso' },
      ],
    },
    {
      name: 'Sprint 8', status: 'done', statusLabel: 'Done · 19 PRs (#112-#131) · el más grande hasta hoy',
      items: [
        { num: 'CRM', text: 'Unificar directorio CRM↔Contactos (Party único = occupants, sync automático por trigger)' },
        { num: 'CRM', text: 'PersonPicker "buscar antes de crear" en contratos/reservas/ocupantes/pagador (mata el duplicado en el origen)' },
        { num: 'CRM', text: 'Persona/Empresa + pagador ≠ ocupante en contratos (caso corporativo/institucional)' },
        { num: 'Estancias', text: 'Vista unificada Estancias (contratos+reservas) + rotación de ocupantes (stay_occupants)' },
        { num: 'Finanzas', text: 'Libro de abonos por movimiento (payment_receipts) — reemplaza "1 pago = 1 mes" que perdía detalle de pagos parciales/divididos' },
        { num: 'Finanzas', text: 'Servicios: cuota de agua por edificio con historial (prorrateo o cuota fija, ya no $250 hardcoded)' },
        { num: 'Finanzas', text: '"Facturar desde" — separa la fecha real del contrato de cuándo arranca a cobrar (clave para dar de alta contratos viejos sin generar adeudo falso)' },
        { num: 'Fix', text: 'lib/billing compartida: Cobros, Mission Control y el Portal del inquilino ahora proyectan el mismo adeudo (antes el dashboard subcontaba)' },
        { num: 'Fix', text: 'Bug crítico: editar contrato no guardaba (columna contract_url inexistente, error tragado en silencio)' },
        { num: 'Cobros UX', text: 'Pago rápido (individual y en lote) · filtro por inquilino/depto · rango Desde-Hasta · ordenar por columna · editar pagos ya registrados · "confirmado por" = usuario logueado' },
      ],
    },
    {
      name: 'Sprint 9', status: 'next', statusLabel: 'Siguiente',
      items: [
        { num: 'Finanzas', text: 'Cuenta combinada / Engagement: agrupar contratos (ej. D102+D202+D201) bajo una cuenta con saldo pooled — estado de cuenta conciliable contra WhatsApp' },
        { num: 'CRM', text: 'D303 multi-inquilino: contratos independientes por sub-ocupante' },
        { num: 'Deuda', text: '#23 eliminar enum legacy member_role (roles owner/admin vs pm_*) — sospechoso en bugs de permisos' },
        { num: 'Roadmap', text: 'Tablero real Now/Next/Later votable, reemplaza este snapshot estático' },
      ],
    },
  ],

  kanban: [
    {
      name: 'Done', emoji: '✅', count: 55,
      cards: [
        { tier: 't1', tierLabel: 'T1 MVP', text: 'Sprint 4 completo (#14-#18)' },
        { tier: 't1', tierLabel: 'T1 MVP', text: 'Channel Manager Channex' },
        { tier: 't1', tierLabel: 'T1 MVP', text: 'Stripe checkout inquilinos' },
        { tier: 't1', tierLabel: 'T1 MVP', text: 'Mora escalamiento 5 niveles' },
        { tier: 't1', tierLabel: 'T1 MVP', text: 'Owner Portal v2 con login' },
        { tier: 't1', tierLabel: 'T1 MVP', text: 'Vista Conserje PWA' },
        { tier: 't1', tierLabel: 'T1 MVP', text: 'Cotizador STR + Bulk CSV import' },
        { tier: 't1', tierLabel: 'T1 MVP', text: 'Modelo de Personas/CRM/Estancias + Finanzas (Sprint 8 completo)' },
        { tier: 't2', tierLabel: 'T2 Core', text: 'Webhooks + Notificaciones in-app' },
        { tier: 't25', tierLabel: 'T2.5 Agent', text: 'Audit log con actor field' },
        { tier: 't25', tierLabel: 'T2.5 Agent', text: 'Agente Cobranza v1 + Alicia/Hugo conectados (Discord)' },
        { tier: 't4', tierLabel: 'T4 Comercial', text: 'Self check-in digital · Onboarding wizard' },
      ],
      footer: '+ deuda Sprint 4-5 cerrada (#19-#25) + ~100 PRs más, ver Sprints 6-8 arriba',
    },
    {
      name: 'En desarrollo', emoji: '🔨', count: 1,
      cards: [
        { tier: 't1', tierLabel: 'T1 MVP', text: 'Diseño de Cuenta combinada (engagement): saldo pooled para D102+D202+D201, conciliable contra el WhatsApp de cobranza' },
      ],
      footer: 'Próximo: D303 multi-inquilino, deuda #23 (enum legacy), y reconstruir este roadmap como tablero votable Now/Next/Later.',
    },
    {
      name: 'Backlog', emoji: '📋', count: 41,
      cards: [
        { tier: 't1', tierLabel: 'T1 MVP · 1', text: 'Cuenta combinada (engagement) + D303 multi-inquilino' },
        { tier: 't25', tierLabel: 'T2.5 Agent · 5', text: 'Handoff UI · Decision trees · Escalation rules' },
        { tier: 't3', tierLabel: 'T3 Backlog · 6', text: 'Deuda #23 (enum legacy) · BaW Public website · Booking engine STR' },
        { tier: 't4', tierLabel: 'T4 Comercial · 19', text: 'WhatsApp ticket · Pre-contrato · SPEI · INPC · Billing SaaS' },
        { tier: 't5', tierLabel: 'T5 Escala · 11', text: '3D Viewer · Smart locks · Community · Compliance' },
      ],
    },
  ],

  tiers: [
    {
      tier: 't1', name: 'Tier 1 — MVP', total: 24, done: 23, doing: 1, backlog: 0,
      items: [
        { text: 'Sprint 4 entero (S4-0 a S4-3)', status: 'done' },
        { text: '+ 14 features Tier 1 anteriores', status: 'done' },
        { text: 'Deuda #20, #22, #25, #19, #21 (conserje, webhooks, owner token, admin login, apply)', status: 'done' },
        { text: 'Modelo de Personas/CRM/Estancias + Finanzas (Sprint 8, ver detalle arriba)', status: 'done' },
        { text: 'Cuenta combinada (engagement) — saldo pooled multi-contrato', status: 'doing' },
      ],
    },
    {
      tier: 't2', name: 'Tier 2 — Core', total: 14, done: 14, backlog: 0,
      items: [
        { text: 'UX Polish · Webhooks · API Docs · Sidebar v2 · multi-tenant', status: 'done' },
        { text: 'Deuda #24 · Migrar 206+ HEX/rgba a tokens BaW', status: 'done' },
      ],
    },
    {
      tier: 't25', name: 'Tier 2.5 — Agent Ready', total: 10, done: 5, backlog: 5,
      items: [
        { text: 'Audit log + actor field · Task creation API · Onboarding wizard · Conserje PWA', status: 'done' },
        { text: 'Agente Cobranza v1 + Alicia/Hugo (Discord, terceros)', status: 'done' },
        { text: 'Agent handoff UI (botón "Automatizar esto")' },
        { text: 'Agent decision trees (occupancy/pricing)' },
        { text: 'Automated escalation rules (if X then Y)' },
        { text: 'Escalation rules configurables' },
        { text: 'Handoff protocol configurable' },
      ],
    },
    {
      tier: 't3', name: 'Tier 3 — Backlog', total: 8, done: 2, backlog: 6,
      items: [
        { text: 'Bug #21 · /apply public_prefix sin ruta', status: 'done' },
        { text: 'Deuda #23 · Eliminar enum legacy member_role (sospechoso en bugs de permisos)' },
        { text: 'BaW Public — SEO + mobile-first' },
        { text: 'BaW Public — Galería deptos LTR' },
        { text: 'BaW Public — Formulario interés LTR' },
        { text: 'BaW Public — Booking Engine público STR' },
        { text: 'BaW Public — Website STR público' },
      ],
    },
    {
      tier: 't4', name: 'Tier 4 — Comercial', total: 29, done: 10, backlog: 19, fullWidth: true, twoCols: true,
      items: [
        { text: 'Legal/Fiscal: Acuerdos D201/D303 · INPC + carta convenio · Bitácora inmutable · Notificaciones acuse · Retenciones Airbnb · IVA STR/LTR/MTR' },
        { text: 'Pagos: SPEI conciliación · P&L por unidad · Mora 12 días alertas' },
        { text: 'Operaciones: WhatsApp → ticket auto · Mantenimiento ficha técnica · Housekeeping checkout' },
        { text: 'UI/UX: Pre-contrato /apply · Multi-property dashboard · Demo mode' },
        { text: 'Integraciones: Unified Inbox WhatsApp+OTAs · Mensajería auto WhatsApp · PriceLabs API' },
        { text: 'SaaS: Billing Stripe (Starter/Pro/Enterprise)' },
      ],
    },
    {
      tier: 't5', name: 'Tier 5 — Escala', total: 17, done: 1, backlog: 11, discarded: 5, fullWidth: true,
      items: [
        { text: 'Compliance: LFPDPPP aviso privacidad (obligatorio antes SaaS externo)' },
        { text: 'SaaS: Billing module · Demo mode · Sandbox' },
        { text: 'Smart Building: Smart lock Igloohome/Yale · Moodpad guest controls · 3D Viewer + iOS LiDAR' },
        { text: 'Community: Guest experience app · Perfil residente + eventos' },
        { text: 'Asset-light: Management fee module (gestión de terceros)' },
      ],
    },
  ],

  nextUp: [
    { id: 'Finanzas', text: 'Cuenta combinada (engagement): contracts agrupados con saldo pooled, estado de cuenta conciliable contra WhatsApp', reason: 'Es lo que más le importa a Fran ahora mismo: control real de D102+D202+D201.' },
    { id: 'CRM', text: 'D303 multi-inquilino: un contrato por sub-ocupante (Ángel, Marlen, Xitlali...)', reason: 'Caso real sin resolver — pagos ya entrando, sin contrato que los reciba.' },
    { id: 'Deuda #23', text: 'Eliminar enum legacy member_role (roles owner/admin vs pm_*)', reason: 'Confusión real de permisos; fue la primera hipótesis (descartada) del bug de editar contratos.' },
    { id: 'Roadmap', text: 'Reconstruir este roadmap como tablero Now/Next/Later votable (con appetite tipo Shape Up)', reason: 'El snapshot estático se queda viejo — ya pasó una vez.' },
  ],
}

// Tiers → tokens BaW (semántica del roadmap):
//   t1 MVP        → success (verde)
//   t2 Core       → info (azul)
//   t2.5 Agent    → agent (morado)
//   t3 Backlog    → neutral (gris)
//   t4 Comercial  → orange
//   t5 Future     → danger (rojo)
export const TIER_TOKENS: Record<Tier, { fg: string; bg: string }> = {
  t1:  { fg: 'var(--baw-success-fg)', bg: 'var(--baw-success-bg-soft)' },
  t2:  { fg: 'var(--baw-info-fg)',    bg: 'var(--baw-info-bg-soft)' },
  t25: { fg: 'var(--baw-agent-fg)',   bg: 'var(--baw-agent-bg-soft)' },
  t3:  { fg: 'var(--baw-neutral-fg)', bg: 'var(--baw-neutral-bg-soft)' },
  t4:  { fg: 'var(--baw-orange-fg)',  bg: 'var(--baw-orange-bg-soft)' },
  t5:  { fg: 'var(--baw-danger-fg)',  bg: 'var(--baw-danger-bg-soft)' },
}
