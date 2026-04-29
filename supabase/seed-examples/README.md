# Seed Examples

Esta carpeta contiene **seeds de referencia históricos**, NO migraciones que deban
correrse contra la base.

Los seeds aquí se preservan como ejemplos de cómo poblar BaW OS para desarrollo
local o testing, pero el flujo canónico de creación de datos en producción es el
**onboarding wizard** (`/onboarding`), no SQL directo.

## Archivos

- `mateos-809.sql` — Seed original del MVP Mateos (Sprint 2, Org `ed4308c7-2bdb-46f2-be69-7c59674838e2`).
  Estructura pre-Sprint 3: usa `units.org_id` directo (sin `building_id`),
  enum `member_role` con `owner/admin/operator/viewer/agent`. **NO se puede correr
  tal cual en BaW OS post-Sprint 3** porque el schema cambió (units ahora requiere
  `building_id NOT NULL` y los roles canónicos son `pm_*`).

  Para reactivar en local, primero sembrar un `building` y mapear los `org_id`
  → `building_id` correspondientes.

## Por qué se preserva

Como el wipe operativo del Sprint 3 borró la data Mateos en producción, este
archivo es la única referencia escrita de la configuración inicial usada para
validar el sistema durante Sprint 1–2 (16 unidades, 9 contracts, 21 incidents,
3 payments).

Sirve como **fixture de referencia** para tests futuros y como evidencia
auditoria del estado pre-multitenancy v2.
