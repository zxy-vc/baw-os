# SMOKE.md — Checklist de smoke testing manual (BaW OS)

> **Qué es:** la lista mínima de caminos críticos que se prueban **a mano** antes de
> soltar un release a producción. No reemplaza los tests automáticos del CI — los
> complementa con lo que solo un humano (o un agente clickeando) puede ver.
>
> **Cuándo se corre:** antes de mergear a `main` algo que toque cobros, contratos,
> auth o PDFs. Toma ~10-15 min. Si algo aquí falla, es **blocker**: no se suelta.
>
> **Cómo se usa:** copia la sección relevante en el PR como checklist, marca cada
> paso, y pega el resultado. Si un paso falla, abre issue con `pasos / esperado / actual / screenshot`.

---

## Convención de severidad

| Sev | Significado | Acción |
|---|---|---|
| **blocker** | Rompe un camino crítico (no se puede cobrar, login roto, datos perdidos) | Frena el release. No merge a `main`. |
| **mayor** | Funciona pero mal (cálculo incorrecto, UI rota en flujo principal) | Se arregla antes del release o se documenta riesgo. |
| **menor** | Cosmético o caso borde raro | Va al backlog. |

---

## 1 · Auth y sesión  *(camino crítico)*

- [ ] Login con credenciales válidas → entra al dashboard.
- [ ] Recargar la página estando logueado → **sigue** logueado (no rebota a login).
- [ ] Cerrar sesión → vuelve a login y no se puede entrar a rutas privadas con back.
- [ ] **Sesión vieja:** con la app abierta horas, una acción server-side (ej. generar PDF)
      **no** debe dar "Unauthorized" silencioso. Si lo da, re-login debe resolverlo.
      *(Esta es la clase del bug del PDF — verificar siempre.)*

## 2 · Cobros  *(camino crítico — zona de bugs recientes)*

- [ ] La tabla de cobros carga con saldos y estatus (al corriente / vencido / mora) correctos.
- [ ] **Registrar pago completo:** abrir modal → método "Transferencia" → guardar →
      muestra *"Pago registrado correctamente"* y el renglón pasa a pagado.
      *(Candado automático: `tests/cobros/payment-method.test.mjs` — bug del enum #94.)*
- [ ] **Registrar pago en efectivo:** mismo flujo con método "Efectivo" → guarda igual.
- [ ] **Pago parcial:** abono menor al total → el saldo restante se refleja, no se duplica el cargo.
- [ ] **Referencia auto:** el campo Referencia llega prellenado tipo `D102-2026-02` y es editable.
      *(Candado automático: `tests/cobros/folio-reference.test.mjs` — bug del folio #95.)*
- [ ] **Mora:** un pago vencido sugiere el recargo escalonado correcto (0% gracia / 5% / 10%).

## 3 · Estado de cuenta / PDF  *(camino crítico)*

- [ ] Generar estado de cuenta de un contrato → abre el PDF sin "Unauthorized".
- [ ] El **folio** se ve tipo `EC-D102-2026-02` (legible, no fragmento de UUID).
- [ ] Los montos (renta, agua, mora, saldo) del PDF cuadran con la tabla de cobros.
- [ ] El mismo depto + mismo mes genera **el mismo folio** (determinista).

## 4 · Contratos / unidades  *(camino importante)*

- [ ] Listado de contratos y unidades carga sin error.
- [ ] Crear / editar un contrato persiste y se refleja al recargar.
- [ ] Un contrato sin ocupante o sin unidad no rompe la vista (fallbacks "—").

## 5 · General  *(sanity)*

- [ ] No hay errores rojos en la consola del navegador en los flujos de arriba.
- [ ] Navegación principal (sidebar) lleva a cada sección sin 404.
- [ ] En móvil, los flujos de cobros y PDF son usables (no se rompe el layout).

---

## Antes de cada release (resumen)

1. CI verde en el PR (lint + typecheck + build + tests, incluido `tests/cobros`).
2. Correr esta checklist en **staging** (no en prod).
3. Sin blockers abiertos → merge a `main` → smoke rápido en prod (secciones 1-3).
4. Si aparece un bug en prod, abrir issue con la plantilla y etiquetar severidad.

*Mantener esta lista viva: cada bug nuevo que se escape a prod agrega un paso aquí
para que no vuelva a pasar inadvertido.*
