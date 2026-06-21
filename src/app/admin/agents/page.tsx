// BaW OS — Platform Admin · Catálogo de Agentes (L0)
//
// Edita la metadata de los agentes y controla cuáles aparecen como conectables
// en /agents. El acceso ya está protegido por el layout de /admin (solo L0).

import { createServiceClient } from '@/lib/api-auth'
import AgentsCatalogManager, { type CatalogAgent } from './AgentsCatalogManager'

export const dynamic = 'force-dynamic'

async function getAgents(): Promise<CatalogAgent[]> {
  const service = createServiceClient()
  const { data } = await service
    .from('agents')
    .select(
      'id, display_name, full_name, family, domain, description, role_label, capability_level, feedback_level, status, is_connectable, is_shared_zxy, updated_at'
    )
    .order('family')
    .order('display_name')
  return (data || []) as CatalogAgent[]
}

export default async function AdminAgentsPage() {
  const agents = await getAgents()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[20px] font-semibold" style={{ color: 'var(--baw-text)' }}>
          Catálogo de Agentes
        </h2>
        <p className="text-[13px] mt-1" style={{ color: 'var(--baw-muted)' }}>
          Edita nombre, descripción, rol y niveles de cada agente, y controla con{' '}
          <strong>Conectable</strong> cuáles aparecen en la pantalla de Agentes para que un
          admin de tenant les emita credenciales.
        </p>
      </div>

      <AgentsCatalogManager initialAgents={agents} />
    </div>
  )
}
