# BaW OS Environments

## Objetivo
Separar BaW OS en tres ambientes claros para evitar mezclar exploración, QA y operación real.

## Ambientes

### 1. LAB
- Branch: `lab`
- Vercel: `lab-baw-os`
- Supabase: `baw-os-lab`
- Uso: exploración, features incompletas, integraciones nuevas, datos dummy
- Regla: aquí nace toda feature nueva

### 2. STAGING
- Branch: `staging`
- Vercel: `staging-baw-os`
- Supabase: `baw-os-staging`
- Uso: QA formal, smoke tests, regression, validación operativa
- Regla: solo entra lo que ya compila y tiene criterio de aceptación claro

### 3. PROD-BAW
- Branch: `main`
- Vercel: `baw-os`
- Supabase: `baw-os-prod`
- Uso: operación real de BaW
- Regla: solo entra lo ya validado por Alicia + Fran

## Promoción entre ambientes
- LAB → STAGING: compila, no rompe flujos existentes, implementación cerrada, criterio de prueba claro
- STAGING → PROD-BAW: validación operacional de Alicia, validación humana de Fran, sin bugs críticos, sin contaminar datos

## Regla dura
- Nunca compartir base de datos entre ambientes
- Nunca compartir secrets críticos entre ambientes cuando aplique
- PROD-BAW no es para probar, es para operar

## Variables mínimas por ambiente
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_VERIFY_TOKEN`
- `GROQ_API_KEY`
- `BAWOS_API_KEY`
- `NEXT_PUBLIC_APP_URL`

## Hallazgos actuales del repo
- Existe `main`, `staging`, `lab`
- `.env.example` ya define las variables base para Supabase, Stripe, WhatsApp, Groq y app URL
- El repo compila correctamente
- El modelo actual sigue siendo org → units, sin tabla `buildings`
- `src/app/units/page.tsx` aún muestra referencia hardcodeada a `ALM809P`

## Clasificación inicial sugerida

### LAB
- multi-edificio
- refactor de modelo `buildings`
- integraciones nuevas no estabilizadas
- agentic workflows experimentales

### STAGING
- onboarding cuando deje de contaminar datos
- contratos cuando el flujo esté completo
- pagos/cobros cuando montos y estados sean consistentes
- dashboard cuando refleje datos reales coherentes

### PROD-BAW
- unidades básicas
- contratos básicos
- pagos/cobros básicos
- incidencias básicas
- dashboard ejecutivo básico

## Orden de implementación
1. Confirmar ramas finales
2. Crear / mapear 3 proyectos Supabase
3. Crear / mapear 3 deployments Vercel
4. Conectar env vars por ambiente
5. Validar deploy y DB por ambiente
6. Promover solo stories estables a `main`
