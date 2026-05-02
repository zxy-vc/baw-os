// BaW OS — Roadmap snapshot data
// v1: estructura desde HTML mock 2026-05-01 (Notion: Internal Roadmap Dashboard)
// v2 (futuro): fetchNotionBoard() + fetchGithubData() con ISR revalidate=300
//
// La spec en Notion (354169373e7281e7b4eef78ea5031e47) describe:
//   - Features → Notion data source 330169373e7281e5b93beda50203b65f
//   - Sprints recorridos → GitHub PRs mergeados
//   - Deuda activa → GitHub issues abiertos
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
  asOf: '2026-05-01 · Cierre Sprint 4',
  totals: { total: 100, done: 47, doing: 1, backlog: 47, discarded: 5 },

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
      name: 'Sprint 5', status: 'next', statusLabel: 'Siguiente',
      items: [
        { num: 'Deuda', text: '#20 conserje /[orgSlug]' },
        { num: 'Deuda', text: '#22 webhooks getOrgIdAsync' },
        { num: 'Deuda', text: '#25 owners legacy OWNER_TOKEN' },
        { num: 'Deuda', text: '#19 /admin → /login' },
        { num: 'Deuda', text: '#24 206+ HEX → tokens BaW' },
      ],
    },
    {
      name: 'Sprint 6+', status: 'future', statusLabel: 'Planeado',
      items: [
        { num: 'Agents', text: '10+1 agentes (5 más)' },
        { num: 'Agents', text: 'Handoff UI · Decision trees · Escalation' },
        { num: 'Comercial', text: 'WhatsApp → ticket · Unified Inbox' },
        { num: 'Comercial', text: 'Pre-contrato /apply · INPC · SPEI' },
        { num: 'SaaS', text: 'Billing Stripe · Demo mode · Multi-property dashboard' },
      ],
    },
  ],

  kanban: [
    {
      name: 'Done', emoji: '✅', count: 47,
      cards: [
        { tier: 't1', tierLabel: 'T1 MVP', text: 'Sprint 4 completo (#14-#18)' },
        { tier: 't1', tierLabel: 'T1 MVP', text: 'Channel Manager Channex' },
        { tier: 't1', tierLabel: 'T1 MVP', text: 'Stripe checkout inquilinos' },
        { tier: 't1', tierLabel: 'T1 MVP', text: 'Mora escalamiento 5 niveles' },
        { tier: 't1', tierLabel: 'T1 MVP', text: 'Owner Portal v2 con login' },
        { tier: 't1', tierLabel: 'T1 MVP', text: 'Vista Conserje PWA' },
        { tier: 't1', tierLabel: 'T1 MVP', text: 'Cotizador STR + Bulk CSV import' },
        { tier: 't2', tierLabel: 'T2 Core', text: 'Webhooks + Notificaciones in-app' },
        { tier: 't25', tierLabel: 'T2.5 Agent', text: 'Audit log con actor field' },
        { tier: 't4', tierLabel: 'T4 Comercial', text: 'Self check-in digital · Onboarding wizard' },
      ],
      footer: '+ 37 features más',
    },
    {
      name: 'En desarrollo', emoji: '🔨', count: 1,
      cards: [
        { tier: 't25', tierLabel: 'T2.5 Agent', text: 'S4-3 · Agente Cobranza v1 + infra común agentes (10+1)' },
      ],
      footer: 'Próximo a entrar: Hardening de deuda Sprint 4 (#19-#25) antes de abrir Sprint 5 funcional.',
    },
    {
      name: 'Backlog', emoji: '📋', count: 47,
      cards: [
        { tier: 't1', tierLabel: 'T1 MVP · 4', text: 'Deuda Sprint 4: #19, #20, #22, #25' },
        { tier: 't2', tierLabel: 'T2 Core · 1', text: '#24 · Migrar 206+ HEX a tokens' },
        { tier: 't25', tierLabel: 'T2.5 Agent · 5', text: 'Handoff UI · Decision trees · Escalation rules' },
        { tier: 't3', tierLabel: 'T3 Backlog · 7', text: 'BaW Public website · Booking engine STR' },
        { tier: 't4', tierLabel: 'T4 Comercial · 19', text: 'WhatsApp ticket · Pre-contrato · SPEI · INPC · Billing SaaS' },
        { tier: 't5', tierLabel: 'T5 Escala · 11', text: '3D Viewer · Smart locks · Community · Compliance' },
      ],
    },
  ],

  tiers: [
    {
      tier: 't1', name: 'Tier 1 — MVP', total: 22, done: 18, backlog: 4,
      items: [
        { text: 'Sprint 4 entero (S4-0 a S4-3)', status: 'done' },
        { text: '+ 14 features Tier 1 anteriores', status: 'done' },
        { text: 'Deuda #20 · /[orgSlug]/conserje (multi-tenant verdadero)' },
        { text: 'Deuda #22 · Webhooks externos getOrgIdAsync' },
        { text: 'Deuda #25 · Migrar owners legacy OWNER_TOKEN' },
        { text: 'Bug #19 · /admin redirige a /login' },
      ],
    },
    {
      tier: 't2', name: 'Tier 2 — Core', total: 14, done: 13, backlog: 1,
      items: [
        { text: 'UX Polish · Webhooks · API Docs · Sidebar v2 · multi-tenant', status: 'done' },
        { text: 'Deuda #24 · Migrar 206+ HEX/rgba a tokens BaW' },
      ],
    },
    {
      tier: 't25', name: 'Tier 2.5 — Agent Ready', total: 10, done: 4, doing: 1, backlog: 5,
      items: [
        { text: 'Audit log + actor field · Task creation API · Onboarding wizard · Conserje PWA', status: 'done' },
        { text: 'S4-3 · Agente Cobranza v1 (en review)', status: 'doing' },
        { text: 'Agent handoff UI (botón "Automatizar esto")' },
        { text: 'Agent decision trees (occupancy/pricing)' },
        { text: 'Automated escalation rules (if X then Y)' },
        { text: 'Escalation rules configurables' },
        { text: 'Handoff protocol configurable' },
      ],
    },
    {
      tier: 't3', name: 'Tier 3 — Backlog', total: 8, done: 1, backlog: 7,
      items: [
        { text: 'Bug #21 · /apply public_prefix sin ruta' },
        { text: 'Deuda #23 · Eliminar enum legacy member_role' },
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
    { id: 'Deuda #20', text: '/(public)/conserje UUID hardcoded → /[orgSlug]/conserje', reason: 'Bloquea producción multi-tenant verdadera.' },
    { id: 'Deuda #22', text: 'Webhooks externos siguen usando shim getOrgIdAsync', reason: 'Bug si hay 2+ tenants.' },
    { id: 'Deuda #25', text: 'Migrar owners legacy del OWNER_TOKEN compartido', reason: 'Security: token único compartido.' },
    { id: 'Bug #19', text: '/admin redirige a / en lugar de /login', reason: 'UX confusa.' },
    { id: 'Cierre #18', text: 'Mergear Agente Cobranza v1 (en review) + abrir 5 agentes restantes del 10+1', reason: '' },
  ],
}

export const TIER_COLORS: Record<Tier, string> = {
  t1: '#10b981',
  t2: '#3b82f6',
  t25: '#a855f7',
  t3: '#6b7280',
  t4: '#f97316',
  t5: '#dc2626',
}
