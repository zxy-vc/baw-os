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
# Clonar repo
git clone https://github.com/zxy-vc/baw-os.git
cd baw-os

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con tus credenciales de Supabase y Stripe

# Correr en desarrollo
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Variables de entorno

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
WHATSAPP_API_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
```

## Contexto del proyecto

**BaW Design Lab** es el programa de co-diseño de ZXY Ventures. BaW actúa como Design Partner #1 — el laboratorio donde se prueba y valida el producto con operación real antes de comercializarlo.

El edificio ALM809P (Adolfo López Mateos 809, León, Gto.) es el primer cliente.

---

*BaW Design Lab · ZXY Ventures · León, México*
