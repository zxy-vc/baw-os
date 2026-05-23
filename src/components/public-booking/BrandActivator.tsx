'use client'

import { useEffect } from 'react'

/**
 * Activa `data-brand="809"` en <html> mientras se monta el grupo
 * (public-booking). Se remueve al desmontar para que la navegación a
 * otros grupos no herede el theme 809.
 *
 * También fuerza `lang="es"` y modo claro (el dashboard usa dark por defecto).
 */
export default function BrandActivator() {
  useEffect(() => {
    const html = document.documentElement
    const prevBrand = html.getAttribute('data-brand')
    const prevLang = html.getAttribute('lang')
    const prevColorScheme = html.style.colorScheme
    const hadDark = html.classList.contains('dark')
    const hadLight = html.classList.contains('light')

    html.setAttribute('data-brand', '809')
    html.setAttribute('lang', 'es')
    // Forzar luz: removemos clase dark del shell global mientras estamos en 809.
    html.classList.remove('dark')
    html.classList.add('light')
    html.style.colorScheme = 'light'

    return () => {
      if (prevBrand) html.setAttribute('data-brand', prevBrand)
      else html.removeAttribute('data-brand')
      if (prevLang) html.setAttribute('lang', prevLang)
      html.style.colorScheme = prevColorScheme
      if (hadDark) html.classList.add('dark')
      else html.classList.remove('dark')
      if (!hadLight) html.classList.remove('light')
    }
  }, [])

  return null
}
