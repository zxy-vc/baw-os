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
    ]
  },
}

module.exports = nextConfig
