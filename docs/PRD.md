# BaW OS — Product Requirements Document v0.1

**Producto:** BaW OS  
**Programa:** BaW Design Lab — Co-diseño de ZXY Ventures  
**Design Partner:** BaW (cliente y laboratorio #1)  
**Versión:** 0.1  
**Fecha:** Marzo 2026  
**Owner:** Fran Durán (ZXY Ventures)  
**Tech Lead:** Andrés (ZXY Agent OS)  
**Operaciones:** Hugo Sánchez, Alicia (ZXY Agent OS)

---

## 1. Visión

### ¿Qué es BaW OS?

BaW OS es el sistema operativo de administración inmobiliaria de BaW — diseñado desde cero para ser operado por agentes de inteligencia artificial, no por humanos frente a una pantalla.

No es otro PMS (Property Management System). Es el primer **Property OS nativo para agentes de IA**: una plataforma donde la capa de operación es la API, los agentes son los operadores primarios, y el dashboard humano es la excepción, no la regla.

### ¿Por qué existe?

BaW operó durante años con Lodgify — un PMS genérico diseñado para administradores humanos. El problema no era Lodgify en sí: era que ningún PMS del mercado fue construido pensando en automatización total ni en operación por agentes.

**Los PMS existentes tienen tres problemas estructurales:**
1. Sus APIs son afterthought, no core — fueron diseñados para UI, no para automatización
2. No integran STR + LTR + MTR en un solo sistema coherente
3. Su modelo de precios penaliza el crecimiento (más unidades = más caro)

BaW OS nace para resolver los tres.

### La tesis

> **BaW no es una empresa de rentas que usa software. Es una empresa de software que opera rentas como laboratorio.**

El inmueble ALM809P es el primer cliente. El producto es el sistema operativo que lo gestiona. Cuando funcione aquí, se vende afuera.

---

## 2. Contexto: BaW Design Lab

**BaW Design Lab** es el programa de co-diseño de ZXY Ventures: el laboratorio interno donde se diseñan, prueban y validan ventures antes de productizarlos.

```
ZXY Ventures
└── BaW Design Lab  ← laboratorio de co-diseño
      └── BaW  ← Design Partner #1 (operador real)
            └── BaW OS  ← primer producto del lab
```

BaW aporta:
- Operación real con datos reales desde el día 1
- Feedback inmediato de Alicia (operaciones) y Fran (supervisión)
- Cicatriz operativa que ningún SaaS externo puede replicar

ZXY aporta:
- Equipo técnico (Andrés + agentes)
- Infraestructura (OpenClaw, Claude Code, stack tech)
- Visión de producto y go-to-market

---

## 3. Diferenciadores vs. Competencia

| Capacidad | Lodgify | Guesty | Neivor | Haven (YC) | **BaW OS** |
|---|---|---|---|---|---|
| STR nativo | ✅ | ✅ | ❌ | ❌ | ✅ |
| LTR/MTR nativo | ❌ | Parcial | ✅ | ❌ | ✅ |
| API como core (no afterthought) | ❌ | Parcial | ❌ | ❌ | ✅ |
| Diseñado para agentes IA | ❌ | ❌ | ❌ | Parcial | ✅ |
| Multi-tenant desde inicio | N/A | N/A | N/A | N/A | ✅ |
| Operador real como laboratorio | ❌ | ❌ | ❌ | ❌ | ✅ |
| CCTV integration | ❌ | ❌ | ❌ | ❌ | ✅ (Tier 3) |
| Open source / hackeable | ❌ | ❌ | ❌ | ❌ | ✅ |

**Haven (YC W25)** es la validación más relevante: YC está apostando en propiedad + IA. Pero Haven resuelve solo mantenimiento y vende a operadoras. BaW OS resuelve el stack completo y *es* la operadora.

---

## 4. Usuarios del Sistema

### Operadores primarios (agentes IA)
- **Hugo Sánchez** — Chief of Staff. Consulta contratos, estado de unidades, reportes vía API. No usa UI.
- **Alicia** — Operaciones BaW. Primer usuario real del dashboard. Gestiona incidencias, pagos, comunicación con inquilinos.
- **Emily** — Comunicación y relación con huéspedes/inquilinos. Accede vía API para contexto de conversaciones.

### Supervisión
- **Fran Durán** — CEO. Ve el dashboard ejecutivo: occupancy rate, ingresos del mes, alertas críticas. No opera, supervisa.

### Usuarios externos
- **Inquilinos LTR/MTR** — Portal para ver contrato, estado de pago, reportar incidencias.
- **Huéspedes STR** — Portal para reservar, check-in/out, comunicación.
- **Proveedores** — Recepción de órdenes de trabajo de mantenimiento.

---

## 5. Features por Tier

### 🔴 TIER 1 — Operación inmediata (Semana 1-2)

**Objetivo:** Reemplazar la función core de Lodgify para LTR/MTR. Tener visibilidad total de ALM809P.

#### 1.1 Unit Registry
- Catálogo de todas las unidades del edificio
- Campos: número de depto, piso, tipo (STR/MTR/LTR), estado (disponible/ocupado/mantenimiento/reservado), notas
- Vista de planta del edificio (tabla, no mapa por ahora)
- Filtros por tipo, estado, piso

#### 1.2 LTR/MTR Dashboard
- Registro de contratos activos por unidad
- Campos: inquilino, fecha inicio/fin, monto mensual, estado de pago, depósito, notas
- Alerta visual cuando contrato vence en < 30 días
- Historial de pagos por contrato

#### 1.3 Payments Tracker
- Registro de pagos esperados y recibidos por mes
- Estado: pendiente / pagado / tarde
- Alerta automática cuando pago lleva > 3 días de retraso
- Resumen mensual de ingresos por tipo (STR/MTR/LTR)

#### 1.4 Comunicación básica
- Envío de mensajes WhatsApp a inquilinos desde la plataforma
- Templates: recordatorio de pago, confirmación de pago recibido, renovación de contrato próxima

---

### 🟡 TIER 2 — Ventaja operativa (Mes 1-2)

**Objetivo:** Conectar agentes IA al sistema. Que Hugo y Alicia operen sin abrir un browser.

#### 2.1 Agent Interface Layer
- API REST documentada (OpenAPI/Swagger)
- Endpoints para todas las operaciones de Tier 1
- Webhooks configurables para eventos clave:
  - `unit.status_changed`
  - `payment.received`
  - `payment.overdue`
  - `contract.expiring_soon`
  - `incident.opened`
  - `incident.resolved`
- Auth via API keys por agente

#### 2.2 Maintenance Module
- Registro de incidencias por unidad
- Prioridad: baja / media / alta / urgente
- Asignación a proveedor con notificación WhatsApp
- Seguimiento de estado: abierta → en proceso → resuelta
- Historial de incidencias por unidad (útil para due diligence de remodelación)
- Estimado de costo y costo real al cerrar

#### 2.3 STR Calendar + Booking Engine
- Calendario de disponibilidad por unidad STR
- Reservas directas con Stripe
- Check-in / check-out tracking
- Bloqueo de fechas manual
- iCal sync (para sincronizar con Airbnb si aplica)
- Comunicación automatizada con huésped (confirmación, instrucciones de acceso, check-out)

---

### 🟢 TIER 3 — Moat y escalabilidad (Mes 3-6)

**Objetivo:** Cara pública de BaW. Ventaja competitiva sostenible. Primer cliente externo.

#### 3.1 Portal público baw.mx
- Huéspedes STR: buscar disponibilidad, reservar, pagar, recibir instrucciones
- Inquilinos LTR/MTR: ver contrato, estado de cuenta, pagar, reportar incidencia
- Diseño de marca BaW (no genérico)

#### 3.2 Dynamic Pricing Engine (STR)
- Ajuste automático de precios por ocupación, temporada, eventos locales en León
- Reglas configurables (precio mínimo, máximo, incremento por fin de semana)
- Comparación con mercado (integración opcional con AirDNA o scraping)

#### 3.3 CCTV Integration
- Conexión con sistema Dahua existente en ALM809P
  - DVR: DH-XVR1B16H-I (serie: 9B0A4EDPAZDB6A0)
  - Frente de calle: VTO6531H (reconocimiento facial)
- Alertas cuando entra una cara no registrada a un piso
- Log de accesos exportable por unidad/fecha
- Vinculación acceso → ocupante (quién entró, a qué depto, cuándo)

#### 3.4 Multi-tenant para clientes externos
- Onboarding de nueva operadora en < 5 minutos
- White-label opcional (su propio dominio y colores)
- Pricing model: flat fee por organización + por unidad activa
- Panel de administración de organizaciones (ZXY como super-admin)

---

## 6. Stack Técnico

```
Frontend      Next.js 14 (App Router + TypeScript)
UI            Tailwind CSS + shadcn/ui
Backend/DB    Supabase (PostgreSQL + Auth + Storage + Realtime + Edge Functions)
Pagos         Stripe (STR booking + pagos LTR via liga de pago)
Comunicación  WhatsApp Business API (Cloud API de Meta)
Deploy        Vercel (frontend) + Supabase Cloud (backend)
Agentes       OpenClaw — consumen REST API de BaW OS
Repositorio   github.com/zxy-vc/baw-os
```

### Principios de arquitectura

1. **API-first:** toda funcionalidad expuesta como API antes de construir UI
2. **Multi-tenant desde el inicio:** Row Level Security por `org_id` en todas las tablas
3. **Webhooks nativos:** los agentes reciben eventos en tiempo real, no pollan
4. **Minimal UI, maximal API:** el dashboard es para supervisión, no para operación
5. **Costo marginal cero al escalar:** Supabase + Vercel escalan sin cambio de arquitectura

---

## 7. Arquitectura Multi-tenant

Cada organización (operadora inmobiliaria) tiene su propio espacio de datos aislado mediante Row Level Security (RLS) en Supabase.

```sql
-- Ejemplo de policy RLS
CREATE POLICY "org_isolation" ON units
  USING (org_id = auth.jwt() -> 'org_id');
```

- BaW = `org_id: baw-alm809p`
- Cliente 2 = `org_id: [slug-del-cliente]`
- ZXY como super-admin puede ver todas las organizaciones

El código es idéntico para todos los clientes. Los datos están completamente separados.

---

## 8. Criterios de Éxito por Tier

### Tier 1 ✅ (Semana 2)
- [ ] Alicia puede ver el estado de todas las unidades de ALM809P en < 30 segundos
- [ ] Hugo puede consultar contratos LTR activos vía API sin abrir un browser
- [ ] Registro de todos los contratos LTR/MTR activos migrado desde Lodgify
- [ ] Cero dependencia de Lodgify para operación LTR/MTR
- [ ] Al menos 1 pago registrado manualmente en el sistema

### Tier 2 ✅ (Mes 1)
- [ ] Hugo opera el 80% de consultas de BaW vía API (sin UI)
- [ ] Alicia recibe webhook cuando hay pago atrasado
- [ ] Primera reserva STR directa procesada con Stripe (sin Lodgify)
- [ ] Primer work order de mantenimiento cerrado en el sistema

### Tier 3 ✅ (Mes 3)
- [ ] baw.mx recibe y procesa reservas directas
- [ ] Sistema CCTV integrado, primer alerta de cara desconocida generada
- [ ] Primera demo para operadora externa interesada

---

## 9. Roadmap

```
Semana 1    Tier 1 MVP en localhost. Alicia lo revisa.
Semana 2    Deploy en Vercel + Supabase Cloud. Alicia lo usa en producción.
Semana 3    Migración de datos desde Lodgify. Cancelación de Lodgify.
Mes 1       Tier 2 completo. Agentes operando vía API y webhooks.
Mes 2       STR booking engine live. Primera reserva directa.
Mes 3       baw.mx rediseñado. Portal de inquilinos live.
Mes 4       CCTV integration. Dynamic pricing beta.
Mes 5-6     Multi-tenant para cliente externo #1.
```

---

## 10. Preguntas Abiertas

- [ ] **Airbnb API:** ¿Aplicar al Connectivity Program para sincronización bidireccional o mantener iCal unidireccional?
- [ ] **Pagos LTR:** ¿Stripe o SPEI directo? (SPEI es más común en México para rentas)
- [ ] **WhatsApp Business API:** ¿Usar número de BaW existente o número nuevo para el sistema?
- [ ] **Nombre del producto externo:** BaW OS es el nombre interno. ¿Cuándo y cómo se renombra para comercializar?

---

*PRD v0.1 — BaW Design Lab · ZXY Ventures · Marzo 2026*
