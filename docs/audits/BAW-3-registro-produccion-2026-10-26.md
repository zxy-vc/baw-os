# BAW-3: conciliación del registro de producción

Verificado en solo lectura el 12 de noviembre de 2026 sobre main `dbdd2d41f2ac1853a4af0f68672f798db495caf3`, proyecto Supabase `zlcgxmllaeweypyodvzk`.

Producción tiene **76 migraciones registradas**. Las cuatro aplicadas con autorización de Fran el 26 de octubre tienen versiones asignadas por el ejecutor MCP que difieren de los nombres de archivo. El contenido registrado de cada una coincide exactamente con el archivo del repositorio: un statement por migración y MD5 del texto idéntico. La comparación se hizo sin obtener datos de negocio ni volver a aplicar SQL.

| Archivo de origen | Versión registrada | MD5 del contenido (repo y registro) |
| --- | --- | --- |
| `20261014010000_public_booking_payment_integrity.sql` | `20261026174629` | `0aabda83a920c2a308846a28817bbe07` |
| `20261015010000_baw18_payments_void.sql` | `20261026174635` | `7d8fea50c0a40cb88e50a819e50f13c7` |
| `20261016020000_agents_grok_bot.sql` | `20261026174640` | `47babc4c7cac6ed933c5736c2416bbe8` |
| `20261021010000_connector_keys.sql` | `20261026174644` | `075fddcfe330c84f3bf02adf934e93f1` |

El manifiesto `supabase/ci/applied-migrations.sha256` ya incluía void. Esta conciliación incorpora los otros tres archivos y lo deja en 76 entradas. Los SHA256 preservan los archivos originales: no se renombra ninguna migración y no se modifica su contenido.

## Cómo verificar sin escribir

```sql
SELECT count(*) AS total FROM supabase_migrations.schema_migrations;
SELECT version, name, cardinality(statements) AS statement_count,
       md5(array_to_string(statements, E'\n')) AS statements_md5
FROM supabase_migrations.schema_migrations
WHERE version >= '20261026'
ORDER BY version;
```

Comparar los cuatro hashes con los archivos originales. Para el manifiesto, recalcular SHA256 de cada archivo nombrado y exigir igualdad y ausencia de duplicados.

**No ejecutar `db push`, `--include-all`, repair ni las migraciones por diferencia de timestamp.** La equivalencia de versiones está documentada arriba; no implica autorización para reescribir la bitácora remota. El rebuild de CI es una base local nueva, no una comparación exhaustiva de estructura con producción.

## Límites de aceptación

Este registro no demuestra aceptación de reservas públicas, conexión de 809Bot, aislamiento de todos los endpoints ni conciliación del edificio 809. No se ejecutó el script BAW-18 Fase B; continúa suspendido. La migración histórica propuesta para cambiar Alicia por Hugo (`20261016010000`) no forma parte de main ni de este mapeo.

Seguimiento: BAW-3 y BAW-11 en Linear; transición Conductor en ENG-740. Los instructivos anteriores que indiquen aplicar de nuevo estas cuatro migraciones quedan superados por este registro.
