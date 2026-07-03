'use client'

import { useState } from 'react'
import MonoLabel from './MonoLabel'

export interface FAQItem {
  q: string
  a: React.ReactNode
}

export const DEFAULT_FAQ: FAQItem[] = [
  {
    q: '¿A qué hora puedo hacer check-in y check-out?',
    a: 'Check-in flexible desde las 15:00 h, check-out hasta las 11:00 h. Si llegas antes o sales después, escríbenos y vemos cómo acomodarte sin costo cuando sea posible.',
  },
  {
    q: '¿Aceptan mascotas?',
    a: 'Sí. Aceptamos perros y gatos hasta 20 kg con un cargo de limpieza adicional. Por favor avísanos al reservar para asignar una unidad adecuada.',
  },
  {
    q: '¿Cuál es la política de cancelación?',
    a: 'Cancelación gratuita hasta 7 días antes del check-in. Cancelaciones entre 7 y 3 días antes reciben reembolso del 50%. Menos de 3 días: no hay reembolso, pero podemos reprogramar.',
  },
  {
    q: '¿Hay estacionamiento incluido?',
    a: 'Sí. Cada unidad tiene un cajón de estacionamiento privado dentro del edificio, sin costo extra.',
  },
  {
    q: '¿Cómo funciona el check-in?',
    a: 'El día de tu llegada recibirás un código de acceso temporal por correo y WhatsApp. No necesitas reunirte con nadie. Si prefieres bienvenida presencial, también la ofrecemos.',
  },
  {
    q: '¿Las unidades tienen cocina completa?',
    a: 'Sí. Todas incluyen estufa, refrigerador, microondas, cafetera, utensilios, vajilla y básicos para cocinar (sal, aceite, especias).',
  },
  {
    q: '¿Se requiere depósito en garantía?',
    a: 'No solicitamos depósito. La reserva se confirma con el pago total y, en caso de daños, te contactamos al cargo asociado en tu tarjeta.',
  },
  {
    q: '¿Cuál es el mínimo de noches?',
    a: 'El mínimo varía por unidad y temporada, generalmente entre 2 y 5 noches. El sistema te lo indica al momento de cotizar.',
  },
]

export default function FAQAccordion({ items = DEFAULT_FAQ }: { items?: FAQItem[] }) {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section id="faq" style={{ paddingTop: 64, paddingBottom: 96 }}>
      <div className="pb-container">
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <MonoLabel as="div" style={{ marginBottom: 12 }}>
            Preguntas frecuentes
          </MonoLabel>
          <h2 style={{ fontSize: 'clamp(32px, 4vw, 48px)', marginBottom: 40 }}>
            ¿Algo que aclarar antes de reservar
            <span className="t-dot" aria-hidden="true">?</span>
          </h2>

          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {items.map((it, i) => {
              const isOpen = open === i
              return (
                <li
                  key={i}
                  style={{
                    borderTop: i === 0 ? '1px solid var(--line)' : 'none',
                    borderBottom: '1px solid var(--line)',
                  }}
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : i)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 24,
                      padding: '24px 0',
                      background: 'transparent',
                      border: 'none',
                      textAlign: 'left',
                      cursor: 'pointer',
                      color: 'var(--ink)',
                    }}
                  >
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, letterSpacing: '-0.01em', lineHeight: 1.3 }}>
                      {it.q}
                    </span>
                    <span
                      aria-hidden="true"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 22,
                        color: 'var(--ink-3)',
                        flexShrink: 0,
                        transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                        transition: 'transform 200ms ease',
                      }}
                    >
                      +
                    </span>
                  </button>
                  <div
                    style={{
                      maxHeight: isOpen ? 400 : 0,
                      overflow: 'hidden',
                      transition: 'max-height 280ms ease',
                    }}
                  >
                    <div
                      style={{
                        padding: '0 0 24px',
                        fontSize: 16,
                        lineHeight: 1.6,
                        color: 'var(--ink-2)',
                        maxWidth: 640,
                      }}
                    >
                      {it.a}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </section>
  )
}
