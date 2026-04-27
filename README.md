# BaW OS

**Property Management System — AI-Native**  
Desarrollado por **BaW Design Lab** · [ZXY Ventures](https://zxy.vc)

---

> BaW OS es el sistema operativo de administración inmobiliaria de BaW — diseñado desde cero para ser operado por agentes de inteligencia artificial.

## ¿Qué es esto?

Un PMS (Property Management System) construido para el futuro de la operación inmobiliaria:

- **STR** (Short-Term Rental) — huéspedes, reservas directas, Stripe
- **MTR** (Mid-Term Rental) — contratos 1-6 meses
- **LTR** (Long-Term Rental) — contratos anuales, inquilinos fijos
- **AI-first** — API como capa primaria, UI como capa de supervisión
- **Multi-tenant** — un sistema, múltiples operadoras

## Stack

| Capa | Tecnología |
|------|------------|
| Frontend | Next.js 14 (App Router + TypeScript) |
| UI | Tailwind CSS + shadcn/ui |
| Backend/DB | Supabase (PostgreSQL + Auth + Realtime) |
| Pagos | Stripe |
| Comunicación | WhatsApp Business API |
| Deploy | Vercel + Supabase Cloud |

## Documentación

- 📋 [PRD v0.1](./docs/PRD.md) — Product Requirements Document completo
- 🗄️ [Schema SQL](./docs/schema.sql) — Estructura de base de datos

## Cómo correr localmente

```bash
# Clonar repo CON submodules (importante: --recurse-submodules)
git clone --recurse-submodules https://github.com/zxy-vc/baw-os.git
cd baw-os

# Si ya clonaste sin --recurse-submodules, inicializa el submodule:
git submodule update --init --recursive

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con credenciales reales (ver sección abajo)

# Correr en desarrollo
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

### Sobre el submodule `baw-design`

Este repo incluye `baw-design` como **git submodule** en `baw-design/`.
Es el sistema de marca y diseño canon (tokens OKLCH, tipografía, ADRs).

**Comandos útiles:**

```bash
# Actualizar el submodule a su último commit en main
git submodule update --remote baw-design

# Ver el commit del submodule actualmente vendorizado
git submodule status
```

El pipeline de Vercel ya hace `git submodule update --init --recursive` automáticamente en cada deploy. Para builds locales, **siempre** corre el comando una vez tras clonar.

## Variables de entorno

Ver `.env.example` para la lista completa con comentarios. Variables mínimas para arrancar:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Las integraciones externas (Stripe, WhatsApp, Mifiel, FacturAPI, Channex) se activan agregando sus credenciales. Mientras estén vacías, la UI esconde los CTAs correspondientes (ver Sprint 1 de cleanup).

## Contexto del proyecto

**BaW Design Lab** es el programa de co-diseño de ZXY Ventures. BaW actúa como Design Partner #1 — el laboratorio donde se prueba y valida el producto con operación real antes de comercializarlo.

El edificio ALM809P (Adolfo López Mateos 809, León, Gto.) es el primer cliente.

---

*BaW Design Lab · ZXY Ventures · León, México*
