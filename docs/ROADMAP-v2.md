# BaW OS — Roadmap v2.0 (Post-Benchmark)

**Actualizado:** 2 abril 2026  
**Basado en:** Benchmark de Rafa (Appfolio vs Airbnb vs Guesty vs BaW OS)  
**CPO:** Hugo Sánchez  

---

## Estado Actual: v0.9.0 — 80% del core para operador <50 unidades

### ✅ Lo que ya tenemos (y es ventaja competitiva)
- Multi-modal STR + LTR + MTR en una sola plataforma (ÚNICO)
- CFDI nativo / Facturación SAT (ÚNICO — ningún competidor lo tiene)
- WhatsApp-first como canal de comunicación (ÚNICO en PMS)
- Agent-native / API-first (17 endpoints documentados)
- Mora automática + cron de pagos mensuales
- Cotizador integrado (B2B/corporate housing)
- Stack moderno (Next.js 14 + Supabase) — iteramos 10x más rápido
- Precio: ~$799 MXN/mes vs $5,600+ MXN de Appfolio o $9,600+ de Guesty

---

## Tier 2A — Bloqueadores STR (Sprint 1, Semanas 1-4)

> **Sin estos 3, no podemos comercializar BaW OS como SaaS externo para operadores STR.**

### 2A.1 Channel Manager (OTA Sync)
- **Qué:** Sincronización bidireccional con Airbnb + Booking.com
- **Cómo:** Integrar Channex o Beds24 API (no construir desde cero)
- **Por qué:** Bloqueador #1 — ningún operador STR migra sin esto
- **Estimado:** 2-3 semanas
- **Prioridad:** 🔴 CRÍTICA

### 2A.2 Guest Portal / Self Check-in
- **Qué:** Link único por reserva con instrucciones, código de acceso, WiFi, guía del lugar
- **Cómo:** Página pública `/guest/[reservation-token]` + envío automático por WhatsApp
- **Por qué:** Estándar de la industria desde 2022. Reduce ops en 30%+
- **Estimado:** 1-2 semanas
- **Prioridad:** 🔴 CRÍTICA

### 2A.3 Dynamic Pricing (PriceLabs)
- **Qué:** Integración con PriceLabs API para precios dinámicos STR
- **Cómo:** Webhook de PriceLabs → actualizar precios en BaW OS. Motor propio como fallback.
- **Por qué:** 70% de PMs serios usa PriceLabs. Sin esto, pierden revenue.
- **Estimado:** 1 semana (integración API, no construir desde cero)
- **Prioridad:** 🔴 CRÍTICA

---

## Tier 2B — Diferenciales MX (Sprint 2, Semanas 5-8)

> **Estos nos separan de cualquier competidor en el mercado mexicano.**

### 2B.1 CFDI / Facturación Automática
- **Qué:** Emisión de facturas CFDI desde BaW OS al registrar pago
- **Cómo:** Integrar FacturAPI (ya tienen plan activo: $330/mes) o Facturama
- **Por qué:** Deal-maker para clientes corporativos y Housing B2B. NADIE lo tiene.
- **Estimado:** 2 semanas
- **Prioridad:** 🟠 ALTA

### 2B.2 Firma Digital de Contratos
- **Qué:** Firma electrónica legal (e.firma) de contratos LTR/MTR
- **Cómo:** Integrar Mifiel (firma legal mexicana) o ISign
- **Por qué:** Actualmente firma es offline — fricción innecesaria
- **Estimado:** 1-2 semanas
- **Prioridad:** 🟠 ALTA

### 2B.3 Portal de Inquilinos
- **Qué:** Inquilinos LTR/MTR ven contrato, estado de cuenta, pagan en línea, reportan mantenimiento
- **Cómo:** Página pública `/tenant/[token]` con auth por link mágico
- **Por qué:** Reduce WhatsApp ops significativamente
- **Estimado:** 2-3 semanas
- **Prioridad:** 🟠 ALTA

### 2B.4 Unified Inbox
- **Qué:** Mensajes de WhatsApp + Airbnb + Booking.com en una sola vista
- **Cómo:** Depende de Channel Manager (2A.1). Agregar vista unificada post-integración.
- **Por qué:** Operadores manejan 3-4 canales. Sin inbox unificado, el PM pierde mensajes.
- **Estimado:** 2 semanas (post channel manager)
- **Prioridad:** 🟠 ALTA

---

## Tier 2C — Owner Portal (Sprint 3, Semanas 9-12)

### 2C.1 Owner Portal + Revenue Reports
- **Qué:** Portal para dueños de propiedades (no operadores)
- **Cómo:** Dashboard separado: ocupación, ingresos, gastos, net revenue por propiedad
- **Por qué:** Crítico para PMs que administran propiedades de terceros
- **Estimado:** 2-3 semanas
- **Prioridad:** 🟡 MEDIA-ALTA

### 2C.2 Housekeeping / Task Automation
- **Qué:** Asignación automática de limpieza post-checkout
- **Cómo:** Trigger en checkout → crear tarea → notificar equipo de limpieza vía WhatsApp
- **Estimado:** 1-2 semanas
- **Prioridad:** 🟡 MEDIA

---

## Tier 3 — Moat y Escala (Mes 4-6)

### 3.1 Mobile PWA Optimizada
- Push notifications, offline support, home screen install
- Prioridad: 🟡 MEDIA

### 3.2 Smart Lock Integration
- Yale o Igloohome API — código único por reserva
- Prioridad: 🟡 MEDIA

### 3.3 AI Leasing Agent
- Agente que responde leads de Airbnb/Booking automáticamente
- Prioridad: 🟢 BAJA (post product-market fit)

### 3.4 Review Management
- Solicitud automática de reviews post-checkout
- Prioridad: 🟢 BAJA

### 3.5 Contabilidad / QuickBooks Integration
- Para clientes que ya usan QuickBooks o Contpaqi
- Prioridad: 🟢 BAJA

---

## Resumen de Prioridades

| Prioridad | Feature | Semanas | Impacto |
|-----------|---------|---------|---------|
| 🔴 | Channel Manager (OTA sync) | 2-3 | Bloqueador comercial #1 |
| 🔴 | Guest Portal / Self Check-in | 1-2 | Estándar industria |
| 🔴 | Dynamic Pricing (PriceLabs) | 1 | Revenue optimization |
| 🟠 | CFDI / Facturación SAT | 2 | Diferenciador MX único |
| 🟠 | Firma digital (Mifiel) | 1-2 | Elimina fricción LTR |
| 🟠 | Portal de inquilinos | 2-3 | Reduce ops WhatsApp |
| 🟠 | Unified Inbox | 2 | Multi-canal |
| 🟡 | Owner Portal | 2-3 | Escala como SaaS |
| 🟡 | Housekeeping | 1-2 | Ops efficiency |
| 🟢 | Mobile PWA, Smart Locks, AI Leasing, Reviews | 4-8 | Moat |

**Timeline total estimado:** 12-16 semanas para Tier 2 completo → producto comercializable.

---

*Roadmap v2.0 — BaW Design Lab · ZXY Ventures · Abril 2026*
