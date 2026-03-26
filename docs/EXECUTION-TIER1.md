# BaW OS — Plan de Ejecución Tier 1 (MVP)

**Versión:** 1.0  
**Fecha:** 26 marzo 2026  
**Objetivo:** Sistema operativo mínimo que reemplaza Lodgify para LTR/MTR en ALM809P  
**Owner técnico:** Andrés (ZXY Agent OS)  
**Usuaria primaria:** Alicia (COO BaW)  
**Fecha objetivo:** Semana del 31 marzo 2026

---

## ¿Qué entrega el Tier 1?

Un sistema web funcional donde Alicia puede:

1. Ver todas las unidades del edificio ALM809P y su estado actual
2. Registrar y consultar contratos LTR/MTR activos
3. Registrar pagos y ver qué inquilinos están al corriente o en mora
4. Recibir alertas automáticas cuando un pago lleva más de 3 días vencido

**El sistema corre solo.** Las alertas son automáticas. Alicia interviene cuando el sistema la notifica.

---

## Alcance exacto del MVP (qué entra, qué NO entra)

### ✅ Entra en Tier 1
- Dashboard de unidades (lista + estado)
- CRUD de contratos LTR/MTR
- Registro manual de pagos
- Alertas automáticas de mora (cron job)
- Auth básica (Alicia y Fran con login)
- Deploy en URL pública (vercel)

### ❌ NO entra en Tier 1 (viene en Tier 2+)
- API para agentes
- Módulo STR / booking engine
- Stripe / cobro en línea
- Portal de inquilinos
- WhatsApp integration
- CCTV

---

## Stack de ejecución

```
Repositorio:   github.com/zxy-vc/baw-os
Framework:     Next.js 14 (App Router + TypeScript)
Base de datos: Supabase (Postgres + Auth)
UI:            Tailwind CSS + shadcn/ui
Deploy:        Vercel
Idioma UI:     Español
```

---

## Estructura de pantallas

```
/ (Dashboard)
├── /units              → Lista de unidades + estado
├── /units/[id]         → Detalle de unidad
├── /contracts          → Lista de contratos activos
├── /contracts/new      → Crear contrato
├── /contracts/[id]     → Detalle + historial de pagos
├── /payments           → Vista mensual de pagos
└── /payments/new       → Registrar pago
```

---

## Schema de base de datos

```sql
-- organizations (multi-tenant base)
organizations: id, name, slug, created_at

-- units (unidades del edificio)
units: id, org_id, name, floor, type (STR/MTR/LTR), 
       status (available/occupied/maintenance/reserved), notes, created_at

-- tenants (inquilinos)
tenants: id, org_id, name, email, phone, notes, created_at

-- contracts (contratos LTR/MTR)
contracts: id, org_id, unit_id, tenant_id, 
           start_date, end_date, monthly_amount, 
           payment_day, deposit_amount,
           status (active/overdue/ended), notes, created_at

-- payments (pagos registrados)
payments: id, org_id, contract_id, 
          amount, payment_date, method (transfer/cash/stripe),
          reference, notes, created_at
```

---

## Automatizaciones del sistema (corren solas)

| Job | Frecuencia | Qué hace |
|-----|-----------|---------|
| `check-overdue-payments` | Diario 9am | Marca contratos como "overdue" si pago lleva >3 días vencido |
| `notify-expiring-contracts` | Diario 9am | Alerta interna cuando contrato vence en <30 días |

Estos jobs corren en **Supabase Edge Functions**. No requieren que ningún agente esté activo.

---

## Criterios de aceptación (cómo sabemos que el MVP está listo)

- [ ] Alicia puede hacer login con su cuenta
- [ ] Alicia puede ver todas las unidades de ALM809P en <10 segundos
- [ ] Alicia puede crear un contrato LTR nuevo en <2 minutos
- [ ] Alicia puede registrar un pago recibido en <1 minuto
- [ ] El sistema marca automáticamente contratos en mora sin intervención
- [ ] Fran puede ver el dashboard ejecutivo (unidades + pagos del mes)
- [ ] El sistema está en una URL pública funcional

---

## Pasos de ejecución

### Paso 1 — Setup inicial (Andrés, ~2 horas)
- [ ] Crear proyecto Next.js en `/baw-os`
- [ ] Configurar Supabase (proyecto + schema SQL)
- [ ] Configurar auth (Alicia + Fran como primeros usuarios)
- [ ] Deploy base en Vercel

### Paso 2 — Módulo Units (Andrés, ~3 horas)
- [ ] Página `/units` con lista de unidades
- [ ] Formulario crear/editar unidad
- [ ] Cambio de estado (disponible/ocupado/mantenimiento)
- [ ] Seed de datos: todas las unidades de ALM809P

### Paso 3 — Módulo Contracts (Andrés, ~4 horas)
- [ ] Página `/contracts` con lista y filtros
- [ ] Formulario crear contrato (unidad + inquilino + fechas + monto)
- [ ] Vista detalle de contrato
- [ ] Indicador visual de estado (activo/mora/por vencer)

### Paso 4 — Módulo Payments (Andrés, ~3 horas)
- [ ] Página `/payments` con vista mensual
- [ ] Formulario registrar pago
- [ ] Estado por contrato: pagado ✅ / pendiente ⏳ / mora 🔴
- [ ] Resumen del mes (total esperado vs. recibido)

### Paso 5 — Automatizaciones (Andrés, ~2 horas)
- [ ] Edge Function: `check-overdue-payments` (cron diario)
- [ ] Edge Function: `notify-expiring-contracts` (cron diario)
- [ ] Alertas en dashboard

### Paso 6 — QA con Alicia (~1 hora)
- [ ] Alicia revisa el sistema con datos reales de ALM809P
- [ ] Feedback y ajustes
- [ ] Sign-off para producción

---

## Lo que necesitamos para arrancar

| Qué | Quién | Estado |
|-----|-------|--------|
| Acceso a Supabase (cuenta ZXY) | Hugo / Fran | ⏳ Pendiente |
| Acceso a Vercel (cuenta ZXY) | Hugo / Fran | ⏳ Pendiente |
| Lista de unidades ALM809P | Alicia | ⏳ Pendiente |
| Contratos LTR/MTR activos actuales | Alicia | ⏳ Pendiente |
| Node.js funcional en entorno Andrés | Hugo (configurar PATH) | ⏳ Pendiente |

---

## Timeline estimado

```
Día 1  → Pasos 1-2 (Setup + Units)
Día 2  → Pasos 3-4 (Contracts + Payments)
Día 3  → Paso 5 (Automatizaciones) + deploy
Día 4  → Paso 6 (QA con Alicia)
Día 5  → Ajustes + go live
```

**Total: 5 días hábiles desde que tenemos los accesos.**

---

*Execution Plan v1.0 — BaW Design Lab · ZXY Ventures · 26 marzo 2026*
