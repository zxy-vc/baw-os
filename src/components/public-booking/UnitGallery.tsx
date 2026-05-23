'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'

/**
 * Galería con thumb-strip horizontal + lightbox modal.
 * Custom (sin dependencias) para mantener bundle pequeño.
 */
export default function UnitGallery({
  images,
  alt,
}: {
  images: string[]
  alt: string
}) {
  const [active, setActive] = useState(0)
  const [lightbox, setLightbox] = useState<number | null>(null)

  const close = useCallback(() => setLightbox(null), [])
  const next = useCallback(
    () => setLightbox((i) => (i === null ? null : (i + 1) % images.length)),
    [images.length]
  )
  const prev = useCallback(
    () => setLightbox((i) => (i === null ? null : (i - 1 + images.length) % images.length)),
    [images.length]
  )

  useEffect(() => {
    if (lightbox === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') prev()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [lightbox, close, next, prev])

  if (!images.length) return null

  return (
    <div>
      {/* Main image */}
      <button
        type="button"
        onClick={() => setLightbox(active)}
        aria-label="Abrir galería"
        style={{
          display: 'block',
          width: '100%',
          padding: 0,
          border: 'none',
          background: 'var(--bg-2)',
          cursor: 'zoom-in',
          borderRadius: 'var(--r-4)',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'relative', aspectRatio: '3 / 2', width: '100%' }}>
          <Image
            src={images[active]}
            alt={`${alt} — imagen ${active + 1}`}
            fill
            sizes="(max-width: 1024px) 100vw, 800px"
            style={{ objectFit: 'cover' }}
            priority={active === 0}
            unoptimized
          />
        </div>
      </button>

      {/* Thumbnails */}
      <div
        role="tablist"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.min(images.length, 6)}, 1fr)`,
          gap: 8,
          marginTop: 12,
        }}
      >
        {images.slice(0, 6).map((src, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={active === i}
            onClick={() => setActive(i)}
            style={{
              position: 'relative',
              aspectRatio: '1 / 1',
              border: active === i ? '2px solid var(--accent)' : '1px solid var(--line)',
              borderRadius: 'var(--r-2)',
              overflow: 'hidden',
              padding: 0,
              background: 'var(--bg-2)',
              cursor: 'pointer',
            }}
          >
            <Image
              src={src}
              alt=""
              fill
              sizes="100px"
              style={{ objectFit: 'cover' }}
              loading="lazy"
              unoptimized
            />
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {lightbox !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Galería ampliada"
          onClick={close}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 14, 12, 0.96)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); close() }}
            aria-label="Cerrar galería"
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              width: 44,
              height: 44,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.16)',
              color: '#fff',
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: 20,
            }}
          >
            ×
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); prev() }}
            aria-label="Anterior"
            style={{
              position: 'absolute',
              left: 20,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 48,
              height: 48,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.16)',
              color: '#fff',
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: 22,
            }}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); next() }}
            aria-label="Siguiente"
            style={{
              position: 'absolute',
              right: 20,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 48,
              height: 48,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.16)',
              color: '#fff',
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: 22,
            }}
          >
            ›
          </button>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ position: 'relative', width: '100%', maxWidth: 1200, aspectRatio: '3 / 2' }}
          >
            <Image
              src={images[lightbox]}
              alt={`${alt} — imagen ${lightbox + 1}`}
              fill
              sizes="100vw"
              style={{ objectFit: 'contain' }}
              unoptimized
            />
          </div>
          <div
            style={{
              position: 'absolute',
              bottom: 20,
              left: '50%',
              transform: 'translateX(-50%)',
              color: '#fff',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              letterSpacing: '0.08em',
            }}
          >
            {lightbox + 1} / {images.length}
          </div>
        </div>
      )}
    </div>
  )
}
