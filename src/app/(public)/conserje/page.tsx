import { redirect } from 'next/navigation';

// Legacy public conserje route — preserved as redirect to multi-tenant route.
// Issue #20: conserje migrated from hardcoded UUID to /[orgSlug]/conserje.
// Default redirect to baw-operations (única org en producción al momento del cutover).
// Si más orgs en el futuro requieren acceso público, usar /[orgSlug]/conserje directamente.
export default function LegacyConserjeRedirect() {
  redirect('/baw-operations/conserje');
}
