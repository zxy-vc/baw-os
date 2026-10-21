// BaW OS — Conector v1 (ENG-624) · GET /api/connectors/v1/units
// Unidades dentro del alcance de la llave. Sin units.status (es manual y no es
// la ocupación: para eso está /occupancy) ni tarifas de lista (ver doc §Tarifa).
import { connectorRead } from '@/lib/connectors/handler'
import { loadScopedUnits, paginateById } from '@/lib/connectors/data'

export const dynamic = 'force-dynamic'

export const GET = connectorRead('units', async (ctx) => {
  const units = await loadScopedUnits(ctx)
  const { page, next_cursor, limit } = paginateById(units, ctx.params)
  return {
    data: page.map((u) => ({
      id: u.id,
      building_id: u.building_id,
      building_name: u.building_name,
      number: u.number,
      type: u.type,
      bedrooms: u.bedrooms,
      bathrooms: u.bathrooms,
      max_guests: u.max_guests,
      archived_at: u.archived_at,
    })),
    rowCount: page.length,
    pagination: { next_cursor, limit },
  }
})
