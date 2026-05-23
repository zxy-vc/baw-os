# ADR-020: Rol canónico de baw.mx

- Status: Accepted
- Date: 2026-05-23
- Authors: Fran (founder), Computer (CTO operativo)
- Supersedes: N/A
- Related: ADR-017 (ruta pública 809), ADR-018 (motor reservas), ADR-019 (brand 809)

## Contexto

El dominio **baw.mx** originalmente apuntaba al landing de Lodgify (proveedor de PMS externo). Al finalizar esa suscripción, el dominio quedó vacío — sin redirigir a ningún producto propio. Mientras tanto, el dashboard interno creció en `baw-os.vercel.app`, un deployment de Vercel que nunca tuvo dominio propio estable.

En paralelo, se definió **809.mx** como la marca operadora del edificio Mateos 809P (ADR-019), visualmente independiente de BaW OS y sin mencionar la plataforma en surface UI. Esto deja a BaW OS sin presencia pública nominal: el producto SaaS existe, pero no tiene home.

La decisión de Fran fue clara: "Lo más lógico es que ahí quede el landing y posteriormente el hosting de la plataforma." Con ese mandato, este ADR fija el rol canónico de cada dominio del ecosistema.

## Decisión

1. **baw.mx** → landing corporativa pública de BaW OS (producto SaaS). Dominio raíz de la marca plataforma.
2. **app.baw.mx** → dashboard / panel de operación. Reemplaza eventualmente `baw-os.vercel.app` como URL canónica del operador.
3. **809.mx** → marca operadora del edificio Mateos 809P, independiente visualmente de BaW OS.
4. La marca **809 NO menciona BaW OS** en surface UI (solo en footer legal, según ADR-017).
5. **baw-os.vercel.app** permanece como deployment origen de Vercel — los dominios custom apuntan a él vía CNAME/A record.

## Arquitectura propuesta

### Fase 1 (Sprint 6 candidato)

| Dominio | Destino | Ruta Next.js |
|---|---|---|
| `baw.mx` | Landing estática BaW OS | `(marketing)/landing` |
| `app.baw.mx` | Dashboard operativo | `/dashboard`, `/agents`, `/units`, etc. |
| `809.mx` | Reservas públicas Mateos 809P | `(public-booking)/mateos-809/*` |

La landing de `baw.mx` se construye dentro del mismo repo `baw-os`, usando un route group `(marketing)` para mantener separación de concerns sin un repositorio adicional.

### Fase 2 (Sprint 7+)

Cuando exista multi-tenant real:

- `baw.mx` sigue siendo landing de plataforma (sin cambios).
- `app.baw.mx` sigue siendo dashboard con autenticación.
- Cada operadora cliente recibe: `{slug}.baw-os.mx` o dominio custom (e.g., `mipm.com` con CNAME a Vercel).

## Consecuencias

### Positivas

- BaW OS tiene presencia pública propia — no oculta detrás de un subdomain de Vercel.
- Separación limpia: `809.mx` (edificio) | `baw.mx` (plataforma) | `app.baw.mx` (operación).
- Onboarding de futuros operadores es inmediato: saben dónde está el producto y dónde operar.
- Dominio `baw.mx` ya existe y está bajo control de Fran — no requiere adquisición.

### Negativas

- Tres dominios a mantener (DNS + SSL renovación).
- Routing host-based más complejo en `middleware.ts`.
- Costo editorial: mantener el landing de `baw.mx` actualizado conforme evoluciona el producto.

## Implementación inmediata

### DNS pendientes para Fran (GoDaddy → Vercel)

**baw.mx**
```
A     @      76.76.21.21
CNAME www    cname.vercel-dns.com
```
Agregar dominio en Vercel project `baw-os` → Settings → Domains.

**app.baw.mx** (configurar después de que `baw.mx` esté activo)
```
CNAME app    cname.vercel-dns.com
```
Agregar como dominio adicional en el mismo Vercel project.

**809.mx**
```
A     @      76.76.21.21
CNAME www    cname.vercel-dns.com
```
Agregar dominio en Vercel project `baw-os` → Settings → Domains.

### Routing host-based (middleware)

Implementar en `src/middleware.ts` post-Sprint 5B:

```typescript
// src/middleware.ts (fragmento)
const host = request.headers.get('host') ?? ''

if (host === '809.mx' || host === 'www.809.mx') {
  return NextResponse.rewrite(new URL('/mateos-809' + pathname, request.url))
}

if (host === 'app.baw.mx') {
  return NextResponse.rewrite(new URL('/dashboard' + pathname, request.url))
}

if ((host === 'baw.mx' || host === 'www.baw.mx') && pathname === '/') {
  return NextResponse.rewrite(new URL('/(marketing)/landing', request.url))
}
```

### Variables de entorno Vercel (aplicar al hacer el switch de dominios)

```env
NEXT_PUBLIC_SITE_URL=https://baw.mx
PUBLIC_BOOKING_ALLOWED_ORIGINS=https://809.mx,https://app.baw.mx,https://baw.mx,https://baw-os.vercel.app
PUBLIC_BOOKING_SUCCESS_URL=https://809.mx/confirmacion/{HOLD_ID}
PUBLIC_BOOKING_CANCEL_URL=https://809.mx/reservar
```

## Open questions

- ¿La landing de `baw.mx` se construye en Sprint 6 o se delega a un Sprint dedicado de marketing?
- ¿El contenido del landing lo redacta Computer / Andrés Mark II, o Fran lo escribe personalmente?
- ¿El logo BaW OS Mark A (definido en ADR-019) es el que va en el landing de `baw.mx`?

## Frases-mandato preservadas

> "Lo que sea más sólido, no más simple"

> "Solo existe un humano, que soy yo"
