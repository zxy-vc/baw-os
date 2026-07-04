# Runbook · Dominios finales (809.mx + os.baw.mx + baw.mx)

> Fase 1.5 PR B. Los dominios viven en **GoDaddy** (cuenta de Fran); el hosting
> es el proyecto **baw-os** en Vercel. El código ya mapea `809.mx` → edificio
> `mateos-809` en la raíz del dominio (`src/lib/public-booking/domains.ts` +
> `src/middleware.ts`).

## Mapa de dominios

| Dominio | Sirve | Mecanismo |
|---|---|---|
| `809.mx` | Landing pública de Mateos 809 en la raíz (`/`, `/unidades`, `/unidades/[slug]`…) | Middleware: rewrite por Host a `(public-booking)/edificios/mateos-809` |
| `www.809.mx` | Redirige a `809.mx` | Vercel (redirect de dominio) |
| `os.baw.mx` | La plataforma BaW OS (login, dashboard) | Dominio adicional del proyecto, sin código |
| `baw.mx` | Landing informativa de BaW OS (con cintillo hacia 809.mx) | Middleware: rewrite por Host a `(public-marketing)/baw` |
| `www.baw.mx` | Redirige a `baw.mx` | Vercel (redirect de dominio) |
| `baw-os.vercel.app` | Sigue funcionando como siempre | — |

## Paso 1 — Vercel (proyecto baw-os → Settings → Domains)

Agregar, en este orden:

1. `809.mx` → asignar a Production.
2. `www.809.mx` → elegir **Redirect to 809.mx** (308).
3. `os.baw.mx` → asignar a Production.
4. `baw.mx` → asignar a Production (el middleware sirve la landing informativa).
5. `www.baw.mx` → elegir **Redirect to baw.mx** (308).

Al agregar cada dominio, Vercel muestra los registros DNS exactos que espera
y el estatus (Invalid Configuration hasta que el DNS propague). **Usar los
valores que Vercel muestre** — los de abajo son los típicos.

## Paso 2 — GoDaddy (DNS de cada dominio)

⚠️ **Solo AGREGAR/EDITAR los registros indicados. No borrar registros MX ni
TXT existentes** — ahí vive (o vivirá) el correo `hola@809.mx`.

### 809.mx
| Tipo | Nombre | Valor | TTL |
|---|---|---|---|
| A | `@` | `76.76.21.21` (o el que indique Vercel) | 1h |
| CNAME | `www` | `cname.vercel-dns.com` | 1h |

### baw.mx
| Tipo | Nombre | Valor | TTL |
|---|---|---|---|
| A | `@` | `76.76.21.21` (o el que indique Vercel) | 1h |
| CNAME | `www` | `cname.vercel-dns.com` | 1h |
| CNAME | `os` | `cname.vercel-dns.com` | 1h |

Si GoDaddy ya tiene un registro A en `@` (estacionado/parking), se **edita**
con el valor nuevo. Propagación: minutos a ~1 hora normalmente.

## Paso 3 — Supabase (para que el login funcione en os.baw.mx)

Dashboard → Authentication → URL Configuration:

- **Site URL**: `https://os.baw.mx`
- **Additional Redirect URLs**: agregar `https://os.baw.mx/**` y conservar
  `https://baw-os.vercel.app/**`.

## Paso 4 — Env vars en Vercel

- `NEXT_PUBLIC_SITE_URL` = `https://os.baw.mx` (es la base de la plataforma;
  las URLs públicas de 809 salen del mapa de dominios en código, no de aquí).
- Redeploy después de cambiarla.

## Verificación

1. `https://809.mx` → landing 809 (hero "Dieciséis estancias.").
2. `https://809.mx/unidades` → grid de unidades con URL limpia.
3. `https://809.mx/edificios/mateos-809` → redirige (308) a `https://809.mx/`.
4. `https://www.809.mx` → redirige a `https://809.mx`.
5. `https://os.baw.mx` → login de BaW OS; iniciar sesión y verificar que la
   sesión persiste (si no, revisar Paso 3).
6. `https://baw.mx` → landing informativa de BaW OS (cintillo hacia 809.mx, formulario de lista de interés).
7. Ver una tarjeta compartida: pegar `https://809.mx` en WhatsApp → debe
   mostrar la OG card "Dieciséis estancias. Una dirección.".

## Notas

- El certificado TLS lo emite Vercel automáticamente al validar el dominio.
- Cuando el 2020 (u otro edificio) tenga dominio propio: agregar el par a
  `DOMAIN_BUILDINGS`/`BUILDING_DOMAINS` en `src/lib/public-booking/domains.ts`
  (o migrarlo a `buildings.custom_domain` — follow-up del PR C) + repetir
  Pasos 1–2 con ese dominio.
- La landing informativa de baw.mx registra los leads de la lista de interés
  en CRM vía `MARKETING_LEADS_ORG_ID` (ver `.env.example`); sin esa env el
  formulario cae a `mailto:admin@baw.mx`.
