/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // @react-pdf/renderer no debe bundlearse: se resuelve como módulo de Node
    // en el server (evita errores de empaquetado en App Router).
    serverComponentsExternalPackages: ['@react-pdf/renderer'],
    // Asegura que las fuentes TTF del estado de cuenta viajen en el bundle
    // serverless de la ruta que genera el PDF.
    outputFileTracingIncludes: {
      '/api/contracts/[id]/estado-cuenta': ['./src/lib/pdf/fonts/**'],
    },
  },
  async redirects() {
    return [
      // Fase 1 Public Listing: /mateos-809 vivía en la raíz; ahora todos los
      // edificios públicos cuelgan de /edificios/[buildingSlug]. 308 preserva
      // SEO y links compartidos.
      {
        source: '/mateos-809',
        destination: '/edificios/mateos-809',
        permanent: true,
      },
      {
        source: '/mateos-809/:path*',
        destination: '/edificios/mateos-809/:path*',
        permanent: true,
      },
      // Fase 0 finanzas (ADR-022 D1/D2): /payments era el flujo legacy de
      // registro de pagos (sin org_id, sin abonos/bitácora) y /payments
      // (índice) nunca existió. Todo va a /cobros, el modelo canónico.
      {
        source: '/payments',
        destination: '/cobros',
        permanent: true,
      },
      {
        source: '/payments/:path*',
        destination: '/cobros',
        permanent: true,
      },
    ]
  },
}

module.exports = nextConfig
