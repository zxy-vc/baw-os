# Spec — Modelo de Servicios y Egresos (agua, luz, gas, internet)

**Status:** propuesta · Fase 1 en construcción
**Autor:** Claude Code · **Ejecutor:** Claude Code
**Origen:** Fran ↔ Claude — el agua de 809 es un recibo único prorrateado, pero lo
ideal es que cada servicio (agua/luz/gas/internet) se pueda cobrar de distintas
formas según el inmueble, el tipo de renta y la política del dueño/administrador,
ligado a los egresos/consumos reales.

---

## 0. Objetivo

Cobrar los **servicios** (agua, luz, gas, internet, +custom) de forma flexible,
sin hardcodear montos, y que un cambio (de tarifa o de recibo) **se aplique solo**
a las unidades que corresponda, **independiente del contrato**.

---

## 1. Principio núcleo

Un servicio NO se guarda como número fijo en el contrato. Es una **política +
una tarifa vigente** que Cobros **resuelve al momento de generar cada cargo**.
Así, actualizar el agua de un edificio = un cambio de tarifa, no editar N contratos.

---

## 2. Los 4 modos de cobro de un servicio (por unidad)

| Modo | Qué significa | Caso típico |
|---|---|---|
| **Incluido** | va dentro de la renta, no se cobra aparte | STR (servicios incluidos) |
| **Cuota fija** | monto fijo mensual configurable (el $250 de hoy) | acuerdo simple |
| **Prorrateado** | un recibo del edificio ÷ unidades del periodo | agua 809 (un recibo, se reparte) |
| **Individual / medido** | el inquilino paga su propio recibo (su consumo) | LTR con medidor propio |

---

## 3. Configuración (jerarquía de defaults → override)

La política se resuelve en cascada (lo más específico gana):

1. **Default por org / dueño-administrador:** ej. *"en mis edificios: agua =
   prorrateada; luz/gas/internet = individual."*
2. **Default por tipo de renta:** LTR → individual · MTR → cuota/incluido · STR → incluido.
3. **Override por edificio.**
4. **Override por unidad o contrato** (la excepción).

---

## 4. Ligado a egresos / consumos

- **Prorrateado:** se registra el **recibo del edificio** (un egreso del periodo) y
  la cuota = `total ÷ unidades participantes`. Cambia el recibo ⇒ cambia la cuota.
- **Individual:** se registra el **recibo/consumo de la unidad** ⇒ ese monto es el cargo.
- **Cuota / Incluido:** no dependen del egreso.

El egreso vive en el módulo de **Gastos** (`/gastos`), etiquetado por servicio,
edificio/unidad y periodo, para que el prorrateo y los reportes lo consuman.

---

## 5. Generación de Cobros

Por cada **unidad × mes**, por cada **servicio** activo: se resuelve su **modo** y
su **monto** (0 si incluido, fijo si cuota, prorrateo si compartido, recibo si
individual) y se suma al cobro del mes. Una vez registrado el pago, el monto del
servicio queda **congelado** en ese cobro (histórico); la tarifa solo afecta meses
aún no cobrados.

---

## 6. Modelo de datos

| Concepto | Tabla | Notas |
|---|---|---|
| **Tarifa de servicio compartido** (cuota/prorrateo) | `service_rates` | org, building_id (NULL=org), service, amount, effective_from, notes. Historial efectivo. **(Fase 1)** |
| **Política de servicio por unidad/contrato** | `unit_services` | unit_id (o contract_id), service, mode (incluido/cuota/prorrateo/individual), override_amount? **(Fase 2)** |
| **Egreso/recibo** | `gastos` (extender) | service, building_id/unit_id, period, amount. **(Fase 3)** |
| **Defaults por org / tipo de renta** | `org_service_policy` | service → mode default por tipo de renta. **(Fase 3)** |

---

## 7. Plan por fases

1. **Fase 1 — Agua por edificio (resuelve 809):** tabla `service_rates` (service
   `agua`), tarifa por edificio con **historial efectivo**; panel para registrar
   actualizaciones (con helper "recibo ÷ unidades"); Cobros resuelve la cuota de
   agua vigente por edificio/mes (fallback $250). Cubre cuota fija + prorrateo manual.
2. **Fase 2 — Catálogo de servicios + modos:** luz/gas/internet, `unit_services`
   con los 4 modos y defaults por tipo de renta; Cobros suma todos los servicios.
3. **Fase 3 — Egresos automáticos + políticas por dueño:** registrar recibos en
   Gastos etiquetados por servicio; prorrateo automático desde el egreso; políticas
   default por org/administrador; reportes de servicios.

---

## 8. Decisiones abiertas

1. **Prorrateo:** ¿partes iguales entre unidades, o ponderado (por m², por
   recámaras, por ocupantes)? Fase 1 asume **partes iguales** (configurable después).
2. **Unidades participantes en el prorrateo:** ¿todas las del edificio, o solo las
   ocupadas/con contrato activo? Fase 1: **con contrato activo**.
3. **Servicios custom:** ¿catálogo fijo (agua/luz/gas/internet) o libre? Fase 2: libre.
