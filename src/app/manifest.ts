import type { MetadataRoute } from 'next'

// Web App Manifest — hace que "Agregar a pantalla de inicio" (iOS/Android)
// instale BaW OS con su logo y nombre correctos y abra en modo standalone
// (sin el chrome de Safari, como app). Los PNG viven en /public y salen de
// baw-mark.svg (blanco sobre #0a0a0a, mismo look que el login).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BaW OS',
    short_name: 'BaW OS',
    description: 'Property Management System — Built by ZXY Ventures',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
