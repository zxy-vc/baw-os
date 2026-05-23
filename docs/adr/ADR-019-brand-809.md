# ADR-019: Marca 809 para edificio Mateos

**Status:** Accepted
**Date:** 2026-05-23
**Deciders:** Fran (humano), Computer (agente)
**Sprint:** 5B
**Related:** ADR-017 (Public booking surface), ADR-013 (Brand foundations), ADR-018 (Stripe checkout)

---

## Contexto

ADR-017 canonizó que la marca del edificio Mateos sería **independiente** de BaW OS. Durante la sesión del 14 de mayo se propusieron 4 direcciones (Mateos 809P, Casa Mateos, 809, Mateos House). El 23 de mayo, durante decisión final, surgió que el dominio `809.mx` está disponible a costo simbólico (MXN $0.01 el primer año, 3 años de protección).

Eso desbloqueó la decisión final: el nombre y dominio convergen en **809**.

## Decisión

### 1. Nombre y wordmark

- **Marca:** `809`
- **Lockup completo:** `809` + regla horizontal + `MATEOS · LEÓN · MX` en mono caps
- **Pronunciación oficial:** "ocho-cero-nueve" en español; "eight-oh-nine" en inglés (cuando aplique post-v1)
- **Domain primario:** `809.mx`
- **Domain alternativo (opcional, post-validación):** `809mateos.com` o `mateos809.com` para SEO internacional

### 2. Dirección visual: Galería pura

(Variante B del estudio realizado el 23-may)

- **Filosofía:** "el número carga toda la presencia, la paleta solo lo deja respirar"
- **Vibe de referencia:** Aesop, Standard Hotel, Norm Architects, Kinfolk
- **Tono editorial mínimo:** frases nominales, sin floritura, español primero

### 3. Tipografía

- **Display:** EB Garamond (serif editorial). Pesos 300 y 400. El wordmark se compone en peso 300 con `letter-spacing: 0.18em`.
- **Body:** Inter. Pesos 300, 400, 500, 600.
- **Mono:** JetBrains Mono. Solo en labels mayúsculas, fechas y datos editoriales.

### 4. Paleta OKLCH

| Token | OKLCH | HEX | Uso |
|---|---|---|---|
| bg | oklch(0.985 0.002 90) | #FAFAF8 | Fondo principal |
| ink | oklch(0.15 0.005 90) | #1A1A18 | Texto principal |
| ink-muted | oklch(0.45 0.005 90) | #6A6A66 | Texto secundario |
| accent | oklch(0.30 0.06 240) | #2E3850 | Único color con saturación (CTAs, links) |
| surface | oklch(0.94 0.003 90) | #EDEDEA | Secciones |
| border | oklch(0.88 0.004 90) | #DCDCD8 | Líneas |

Paleta completa en `baw-design/themes/809/tokens.json`.

### 5. Tono de voz

- **Personalidad:** mínima, editorial, presencia
- **Frases nominales:** "Doce departamentos. León centro. Estancia desde una noche."
- **Evitar:** exclamaciones, emojis en copy oficial, verbos imperativos largos, referencias a BaW OS, lenguaje promocional

### 6. Separación de marcas (cumplimiento ADR-017)

- 809 no menciona BaW OS en ninguna superficie pública del huésped.
- BaW solo aparece en avisos legales (operador responsable) por requisito normativo.
- Tokens 809 viven en `baw-design/themes/809/`, completamente separados del theme corporativo `baw-design/themes/default/`.

## Consecuencias

### Positivas

- Wordmark de 3 caracteres → máximo impacto visual, mínimo costo cognitivo.
- Dominio `.mx` de bajo costo y alto valor SEO local.
- Theme aislado en `baw-design/themes/809/` facilita futuros edificios.
- Tono editorial mínimo es fácil de mantener (menos texto = menos errores).

### Negativas / trade-offs

- "809" es un número, no se memoriza fácil sin contexto. Mitigación: lockup con "Mateos · León · MX".
- Wordmark muy minimal puede sentirse genérico sin lockup. Mitigación: en hero y favicon usar el número aislado; en footer/legal usar lockup completo.
- Si en el futuro hay un edificio en otro número (ej. Reforma 220), tendrá su propia marca; el patrón 809 no escala como sistema visual unificado pero sí como **metodología** ("cada edificio = su número como marca").

### Riesgos

- Confusión con número de teléfono o código. Mitigación: el contexto del landing y dominio `.mx` lo aclaran.
- SEO inicial difícil (palabra demasiado corta). Mitigación: páginas optimizadas con "Mateos 809 León" en title/H1, JSON-LD `LodgingBusiness` con dirección completa.

## Implementación

1. Crear `baw-design/themes/809/`:
   - `tokens.json` (paleta + tipografía + spacing + radius + tone)
   - `colors.css` (custom properties OKLCH con HEX fallback)
   - `typography.css`
   - `logo-809.svg` (wordmark solo)
   - `logo-809-lockup.svg` (con MATEOS · LEÓN · MX)
   - `favicon.svg`
   - `README.md` con guía de uso
2. En baw-os: importar tokens 809 en el layout del grupo `(public-booking)/mateos-809/`.
3. Compra del dominio `809.mx` a Fran (vía GoDaddy MXN $0.01).
4. Sprint 5B WS-2 (frontend) consume estos tokens.

## Notas

- "Mateos 809P" → "Mateos 809" en marca pública. El "P" (Plaza) puede quedar en documentación interna pero no aparece en el front público.
- El edificio sigue identificándose internamente en DB como `slug: 'mateos-809'`. La marca pública es `809`.
