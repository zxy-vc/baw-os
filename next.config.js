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
}

module.exports = nextConfig
