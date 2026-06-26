# Spec — Modelo de Personas, CRM y Estancias (operación híbrida STR/MTR/LTR)

**Status:** propuesta · pendiente de revisión por Fran
**Autor:** Claude Code (planeación) · **Ejecutor previsto:** Claude Code
**Origen:** discusión Fran ↔ Claude sobre cómo estructurar la sección "Inquilinos"
(Contactos / Clientes / Contratos / Expedientes) para una operación híbrida.

> Este spec es el **plano de ejecución**. Una vez aprobado, se construye por fases.

---

## 0. Objetivo

Dar una estructura única que maneje **todos** los escenarios de una operación
inmobiliaria híbrida (renta corta STR, media MTR, larga LTR), incluyendo el caso
**corporativo** (una empresa paga, varios usuarios ocupan, las unidades escalan y
los ocupantes rotan), sin duplicar personas ni perder historial.

---

## 1. Principio núcleo

**Separar la IDENTIDAD durable de los EVENTOS en el tiempo.**

Hoy una persona se modela como una fila que "cambia de tipo" (contacto → cliente →
inquilino). Eso truena con la realidad: la gente **brinca** entre tipos de renta,
**regresa**, una **empresa** firma pero varios **usan**, etc.

La solución: una persona/empresa es **una identidad permanente** que **acumula**
relaciones, estancias y roles. Nunca se "convierte" — se le **agrega** historia.

---

## 2. Glosario (lenguaje canónico)

| Término | Definición |
|---|---|
| **Persona / Entidad (Party)** | La identidad durable. Puede ser **persona física** o **empresa**. Una por cada persona/empresa real. Es el "quién", para siempre. |
| **Cliente / Arrendatario** | El rol de quien **firma y paga** una estancia (persona o empresa). Un Party puede ser cliente muchas veces. |
| **Ocupante / Usuario** | Quien **usa** el inmueble durante una estancia. Puede ser ≠ del que paga, y pueden ser **varios** y **rotar**. |
| **Estancia (Stay)** | El concepto paraguas: un Party ocupa una Unidad por un periodo. Se **formaliza** con un instrumento (reservación o contrato). |
| **Reservación** | Instrumento estilo *booking*: check-in/out, días/semanas/meses, huéspedes, poco screening. STR/MTR. Sincronizable con OTAs (Channex). |
| **Contrato** | Instrumento estilo *arrendamiento*: plazo, renta mensual, depósito, aval, renovación, fiscal/legal. LTR (y MTR formal). |
| **Expediente / Screening** | El file de documentos + verificación para **aprobar** a un Party. Escalado por tipo. Habilita un contrato. |
| **CRM / Relación** | El ciclo de vida y pipeline sobre un Party: etapa, fuente, oportunidades, timeline. "Mantener la relación." |
| **Cuenta corporativa / Engagement** | Agrupación de varias estancias bajo una empresa, con escalamiento flexible de unidades en el tiempo. |

---

## 3. El modelo (3 capas + 2 transversales)

```
① PERSONA/ENTIDAD (durable: persona o empresa)        ← identidad, se deduplica aquí
        │
        ▼
② CRM / RELACIÓN (etapa, fuente, oportunidades, timeline)   ← "mantener al cliente"
        │
        ▼
③ ESTANCIAS (Party → Unidad → periodo → tipo STR/MTR/LTR)   ← historial transaccional
        │      instrumento: Reservación | Contrato
        ├──▶ ⓐ OCUPANTES/USUARIOS (quién usa; ≠ quién paga; varios; rotan)
        └──▶ ⓑ EXPEDIENTE (screening, escalado por tipo)

(transversal) RELACIONES Party↔Party: referido_por, empleado_de, aval_de, familiar_de
```

---

## 4. Reservación vs Contrato vs Estancia (la aclaración)

**Estancia** = la abstracción única. **Reservación** y **Contrato** son dos formas
de formalizarla, que correlacionan con duración y formalidad:

| | **Reservación** | **Contrato** |
|---|---|---|
| Tipo típico | STR, MTR | LTR (y MTR formal) |
| Duración | noches / semanas / meses | plazo fijo (6m, 1 año) o mes a mes |
| Define | check-in/out, # huéspedes, tarifa por periodo | renta mensual, depósito, aval, términos legales |
| Quién usa | normalmente el que renta + invitados | titular(es) + ocupantes declarados |
| Screening | mínimo (datos) | full (expediente) |
| Rotación de ocupantes | sí (común) | poco común |
| OTAs / Channex | sí | no |

**Reglas:**
- Una **Estancia** SIEMPRE liga: `party_arrendatario` + `unit` + `periodo` + `tipo`.
- El **instrumento** (`reservacion` | `contrato`) determina qué campos aplican y el
  nivel de screening requerido.
- **MTR es la zona gris:** puede ser una reservación larga o un contrato corto. Lo
  decide la formalidad que se quiera (factura/empresa/aval ⇒ contrato).
- Una persona puede tener **muchas estancias** a lo largo del tiempo (su historial) y
  **varias activas a la vez** (su "portafolio" de unidades).

---

## 5. Expediente / Screening (escalado por tipo)

El **Expediente** es el dossier de aprobación de un Party (ligado a una estancia
prospectada). **No es lo mismo para todos** — se escala:

| Tipo | Nivel de expediente |
|---|---|
| **STR** | Mínimo: nombre, contacto, ID opcional. (El "expediente" casi no existe.) |
| **MTR** | Ligero: ID, comprobante básico; si es empresa, datos fiscales. |
| **LTR** | Full: INE, comprobante de ingresos, **aval**, domicilio, datos fiscales, e-firma. Es un **mini-producto** (el flujo `/apply/[token]` ya existente). |

- El expediente **vive en el Party** (su file) y se referencia desde la estancia.
- Estados: `borrador → enviado → en revisión → aprobado → rechazado`.
- Aprobado ⇒ habilita generar el **Contrato**. El expediente queda como historial.

---

## 6. El caso corporativo (el más variable)

**Escenario real:** una constructora llega para una obra. Empieza con 1 depa para
3-4 personas → trae 10 → necesita 2-3 depas → luego 4 → al terminar baja a 1 persona
un mes más. Los ocupantes **rotan semana a semana**. **La empresa paga y factura;**
los que ocupan son sus empleados.

**Modelo:**
- La **Empresa = un Party (`tipo = empresa`)** — la cuenta durable que paga y factura.
- Una **Cuenta corporativa / Engagement** agrupa **N estancias** de esa empresa (una
  por unidad y periodo), y permite **escalar unidades** sin perder el hilo.
- Cada **Estancia** tiene su lista de **Ocupantes** con **rango de fechas** (para la
  rotación: distintas personas distintas semanas).
- El **pagador** (`payer_party_id` = la empresa) es ≠ de los **ocupantes**.
- Facturación: a nivel de la cuenta/empresa (consolidada o por unidad, configurable).

```
EMPRESA (Party)
  └─ Engagement "Obra Planta León 2026"
       ├─ Estancia · Depa A · jun–ago · ocupantes: [Juan(jun), Pedro(jul), …]
       ├─ Estancia · Depa B · jul–sep · ocupantes: [equipo 10p, rotando]
       └─ Estancia · Depa C · ago · ocupantes: [2p]
  → factura consolidada a la empresa
```

Esto cubre: escalar/reducir unidades, ocupantes que rotan, el que busca ≠ el que
paga, y mantener todo bajo una sola relación con la empresa.

---

## 7. Ciclo de vida CRM (la relación en el tiempo)

Sobre cada Party corre un **pipeline** que **acumula** (no reemplaza):

- **Etapa:** `prospecto → calificado → cliente activo → recurrente → inactivo`.
- **Fuente:** Airbnb / Google / referido / directo / OTA.
- **Oportunidades:** una persona puede tener varias (una que se ganó = rentó; otra
  que se perdió = nunca rentó aunque se le armó contrato).
- **Conversión de tipo:** STR → MTR → LTR es solo una **nueva estancia** de otro tipo
  en el mismo Party; la etapa avanza.
- **Regreso:** se fue y vuelve ⇒ nueva estancia/oportunidad en el mismo Party.
- **Relaciones Party↔Party:** referido_por, empleado_de (empresa), aval_de, familiar_de
  → para los casos "no es la misma persona pero están correlacionados".

---

## 8. Ciclo de vida del Contrato (resolver los "colgados")

Problema actual: contratos LTR que se quedan **colgados** (mismos términos, nadie los
toca). El modelo de estados debe hacerlos visibles y accionables:

`activo → por_vencer (alertas 60/30/15d) → en_renovación → renovado | mes_a_mes | terminado`

- **mes_a_mes:** contrato vencido que sigue corriendo con los mismos términos
  (rolling) — explícito, no "colgado".
- Alertas y la cola de renovación evitan que se pierdan (ya hay base en
  `contract-alerts`).

---

## 9. Modelo de datos propuesto (mapeo desde lo actual)

> Pragmático: **reusar y ligar**, no romper. Lo actual: `occupants`, `crm_contacts`,
> `crm_opportunities`, `contracts`, `reservations`, `tenant_applications`.

| Concepto | Hoy | Propuesta |
|---|---|---|
| **Party** (persona/empresa durable) | `occupants` (mezcla personas y "tipo") | Enriquecer `occupants` como Party durable: `kind = persona\|empresa`; o tabla `parties` que unifique. La identidad se deduplica aquí. |
| **CRM** | `crm_contacts` + `crm_opportunities` | Anclar al Party (ya hay `occupant_id`). Etapa/fuente/oportunidades. |
| **Estancia** | `contracts` + `reservations` (separados) | Vista/tabla unificadora `stays` con `instrument = reservacion\|contrato`, `type = STR\|MTR\|LTR`, `payer_party_id`, `unit_id`, `start/end`, `status`. |
| **Ocupantes por estancia** | parcial (`reservations.guest_*`, contrato titular) | `stay_occupants (stay_id, party_id, role, start_date, end_date)` para rotación. |
| **Empresa pagadora ≠ usuarios** | no explícito | `stay.payer_party_id` (empresa) vs `stay_occupants` (usuarios). |
| **Cuenta corporativa** | no existe | `engagements (party_id empresa, nombre, periodo)` + `stay.engagement_id`. |
| **Expediente** | `tenant_applications` | Evolucionar a `expedientes (party_id, target_unit_id?, level, status, docs)`; ligado a la estancia prospectada. |
| **Relaciones Party↔Party** | no existe | `party_relationships (from_party, to_party, kind)`. |

> El detalle fino del DDL se define en la Fase 2/3; aquí va la dirección.

---

## 10. Navegación / IA (lo que disparó esto)

- **Contactos → "Personas"** (o "Directorio"): la identidad durable (capa ①).
- **Clientes → "CRM"**: la relación + pipeline + historial (capa ②).
- **Contratos** (+ **Reservas**): las **Estancias** (capa ③) — idealmente una vista
  unificada "Estancias" con filtro por instrumento/tipo.
- **Expedientes**: el screening ligado a Party/estancia.

Orden sugerido en "Inquilinos" (operación): **Personas · Estancias (Contratos/Reservas)
· Expedientes**. El **CRM** vive como su propio plano (captación), no entremezclado.

---

## 11. Plan de implementación por fases

1. **Fase 1 — Lenguaje + IA (barata, sin datos):** renombrar/reordenar pestañas con
   este vocabulario (Personas · Estancias · Expedientes · CRM). Aterriza el modelo en
   la UI sin tocar tablas.
2. **Fase 2 — Party + separación pagador/ocupantes:** Party durable (persona/empresa),
   `stay_occupants` con rangos de fecha, `payer_party_id`. Unifica `occupants`↔`crm_contacts`
   (ligar, no duplicar).
3. **Fase 3 — Estancias unificadas + cuenta corporativa:** `stays` sobre contratos+reservas,
   `engagements`, escalamiento de unidades, facturación consolidada.
4. **Fase 4 — CRM completo + expediente escalado:** pipeline STR→MTR→LTR, fuente,
   oportunidades, relaciones Party↔Party, expediente por nivel.

---

## 12. Decisiones abiertas (para Fran)

1. **Party = enriquecer `occupants`** (menos disruptivo) **o tabla `parties` nueva**
   (más limpio, más migración). ¿Preferencia?
2. **"Estancias" como vista unificada** sobre contratos+reservas, ¿o mantenerlas como
   dos pestañas separadas y solo unificar el modelo por debajo?
3. **Facturación corporativa:** ¿consolidada por empresa, por unidad, o configurable?
4. **¿El CRM sale del sidebar como sección propia**, o se queda como pestaña dentro de
   Inquilinos (respetando "el sidebar no crece")?
5. ¿Hay algún escenario más (depósitos compartidos, subarriendo, etc.) que falte cubrir?
