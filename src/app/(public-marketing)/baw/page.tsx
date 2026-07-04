import { Cintillo, InterestForm } from './MarketingClient'

// Landing informativa de BaW OS (diseño Claude Design · julio 2026).
// Secciones: cintillo → header → hero + Mission Control mock → §01 historia
// → §02 plataforma → §03 IA nativa → §04 809 en vivo → lista de interés
// → footer. Copy fiel al HTML entregado; el mock del dashboard es estático.

export default function BawLandingPage() {
  return (
    <>
      <Cintillo />
      <Header />
      <main>
        <Hero />
        <Historia />
        <Plataforma />
        <IaNativa />
        <Live809 />
        <Interes />
      </main>
      <FooterMkt />
    </>
  )
}

function BawWordmark({ size = 18 }: { size?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
      <span style={{ fontWeight: 700, fontSize: size, letterSpacing: '-0.02em', color: 'var(--mkt-text)' }}>
        BaW
      </span>
      <span
        style={{
          fontFamily: 'var(--mkt-mono)',
          fontSize: size * 0.62,
          letterSpacing: '0.12em',
          color: 'var(--mkt-text-3)',
          border: '1px solid var(--mkt-line-2)',
          borderRadius: 4,
          padding: '1px 5px',
        }}
      >
        OS
      </span>
    </span>
  )
}

function Header() {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 40,
        background: 'color-mix(in oklab, var(--mkt-bg) 88%, transparent)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid var(--mkt-line)',
      }}
    >
      <div
        className="mkt-wrap"
        style={{ display: 'flex', alignItems: 'center', gap: 24, height: 60 }}
      >
        <a href="#top" aria-label="BaW OS — inicio">
          <BawWordmark />
        </a>
        <nav
          aria-label="Principal"
          style={{ display: 'flex', gap: 20, fontSize: 13.5, color: 'var(--mkt-text-2)', marginLeft: 12 }}
        >
          <a href="#historia">Historia</a>
          <a href="#plataforma">Plataforma</a>
          <a href="#ia">IA nativa</a>
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <a
            href="https://809.mx"
            style={{ fontSize: 13.5, color: 'var(--mkt-text-2)', whiteSpace: 'nowrap' }}
          >
            Reservar · 809 ↗
          </a>
          <a href="#interes" className="mkt-btn mkt-btn-primary" style={{ padding: '8px 14px', fontSize: 13 }}>
            Solicitar acceso
          </a>
        </div>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section id="top" style={{ padding: '72px 0 64px' }}>
      <div
        className="mkt-wrap"
        style={{ display: 'grid', gap: 48, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', alignItems: 'center' }}
      >
        <div>
          <p className="mkt-kicker" style={{ marginBottom: 20 }}>
            Property management · AI-native · en producción
          </p>
          <h1 style={{ fontSize: 'clamp(36px, 5vw, 56px)', marginBottom: 20 }}>
            El <span className="mkt-serif" style={{ color: 'var(--mkt-accent-soft)' }}>sistema operativo</span> de administración inmobiliaria.
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.6, color: 'var(--mkt-text-2)', maxWidth: 480, marginBottom: 28 }}>
            Nació operando un edificio real. Reservas, contratos, cobranza y
            mantenimiento en un solo lugar — agentes de IA proponen, un humano
            aprueba.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href="#plataforma" className="mkt-btn mkt-btn-primary">Ver cómo funciona</a>
            <a href="mailto:admin@baw.mx" className="mkt-btn mkt-btn-ghost">Contacto</a>
          </div>
        </div>
        <MissionControlMock />
      </div>
    </section>
  )
}

/** Mock estático de Mission Control — "la interfaz real del OS". */
function MissionControlMock() {
  return (
    <figure style={{ margin: 0 }}>
      <div className="mkt-card" style={{ overflow: 'hidden', boxShadow: '0 24px 60px -24px rgb(0 0 0 / 0.55)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            borderBottom: '1px solid var(--mkt-line)',
            fontFamily: 'var(--mkt-mono)',
            fontSize: 11,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--mkt-text-3)',
          }}
        >
          <span>Mission Control</span>
          <span style={{ color: 'var(--mkt-ok-soft)' }}>● Live · 809</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, background: 'var(--mkt-line)' }}>
          {[
            { k: 'Ocupación', v: '92%', d: '↑ 3 pts' },
            { k: 'Cobros al día', v: '96%', d: '↑ 2 pts' },
            { k: 'Aprobaciones', v: '2', d: 'del agente' },
          ].map((s) => (
            <div key={s.k} style={{ background: 'var(--mkt-surface)', padding: '14px 16px' }}>
              <div style={{ fontSize: 11, color: 'var(--mkt-text-3)', marginBottom: 4 }}>{s.k}</div>
              <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--mkt-text)' }}>{s.v}</div>
              <div style={{ fontSize: 11, color: 'var(--mkt-ok-soft)' }}>{s.d}</div>
            </div>
          ))}
        </div>

        <ul style={{ listStyle: 'none', margin: 0, padding: '8px 16px', borderTop: '1px solid var(--mkt-line)' }}>
          {[
            { u: 'D101', t: 'M. Torres · K. Díaz' },
            { u: 'D102', t: 'E. Núñez · LTR' },
            { u: 'D201', t: 'Hold · Q-118' },
            { u: 'D303', t: 'C. Peña · MTR' },
          ].map((r) => (
            <li
              key={r.u}
              style={{
                display: 'flex',
                gap: 12,
                padding: '7px 0',
                fontSize: 12.5,
                color: 'var(--mkt-text-2)',
                borderBottom: '1px solid var(--mkt-line)',
              }}
            >
              <span style={{ fontFamily: 'var(--mkt-mono)', color: 'var(--mkt-text-3)' }}>{r.u}</span>
              <span>{r.t}</span>
            </li>
          ))}
        </ul>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 16px',
            background: 'var(--mkt-agent-tint)',
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, color: 'var(--mkt-text)' }}>
              <strong style={{ color: 'var(--mkt-agent-soft)' }}>Cobranza</strong> propone 3 recordatorios de pago
            </div>
            <div style={{ fontFamily: 'var(--mkt-mono)', fontSize: 10.5, color: 'var(--mkt-text-3)', marginTop: 2 }}>
              conf 0.94 · reversible 15 min
            </div>
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--mkt-agent-soft)',
              border: '1px solid var(--mkt-agent)',
              borderRadius: 6,
              padding: '5px 10px',
            }}
          >
            Revisar
          </span>
        </div>
      </div>
      <figcaption style={{ marginTop: 10, fontSize: 12, color: 'var(--mkt-text-4)', textAlign: 'center' }}>
        La interfaz real del OS — operando 809 en producción
      </figcaption>
    </figure>
  )
}

function SectionHead({ num, kicker, title }: { num: string; kicker: string; title: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <p className="mkt-kicker" style={{ marginBottom: 14 }}>
        <span style={{ color: 'var(--mkt-accent-soft)' }}>§{num}</span> · {kicker}
      </p>
      <h2 style={{ fontSize: 'clamp(28px, 3.6vw, 40px)', maxWidth: 640 }}>{title}</h2>
    </div>
  )
}

function Historia() {
  const rows = [
    { antes: 'Cobros atrasados, seguimiento manual', despues: 'Cobranza automatizada por WhatsApp' },
    { antes: 'Contratos en papel, firmas perdidas', despues: 'Contratos digitales' },
    { antes: 'Reservas por chat, doble booking', despues: 'Reservas directas con Stripe' },
    { antes: 'Tickets de mantenimiento perdidos', despues: 'Cola de operación unificada' },
  ]
  return (
    <section id="historia" style={{ padding: '64px 0', borderTop: '1px solid var(--mkt-line)' }}>
      <div className="mkt-wrap">
        <SectionHead
          num="01"
          kicker="Cómo empezamos"
          title={
            <>No empezamos diseñando un software. Empezamos <span className="mkt-serif" style={{ color: 'var(--mkt-accent-soft)' }}>operando un edificio</span>.</>
          }
        />
        <div style={{ display: 'grid', gap: 32, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          <div style={{ fontSize: 15.5, lineHeight: 1.65, color: 'var(--mkt-text-2)', display: 'grid', gap: 14 }}>
            <p>
              En vez de partir de una hoja en blanco, empezamos por operar 809,
              un edificio real — con inquilinos reales, cobros reales y
              mantenimiento real.
            </p>
            <p>
              Cada parte de BaW OS existe porque resolvió un problema de
              operación, no porque estuviera en un roadmap. BaW OS es la suma
              de esas soluciones, ordenadas en un sistema.
            </p>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
            {rows.map((r) => (
              <li
                key={r.antes}
                className="mkt-card"
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', fontSize: 13.5 }}
              >
                <span style={{ color: 'var(--mkt-text-3)', flex: 1 }}>{r.antes}</span>
                <span aria-hidden="true" style={{ color: 'var(--mkt-accent-soft)' }}>→</span>
                <span style={{ color: 'var(--mkt-text)', flex: 1 }}>{r.despues}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

function Plataforma() {
  const modulos = [
    { n: '01', t: 'Reservas directas', d: 'El huésped reserva y paga sin intermediarios.', via: 'vía Stripe' },
    { n: '02', t: 'Contratos digitales', d: 'Se generan, firman y archivan dentro del mismo sistema.', via: null },
    { n: '03', t: 'Cobranza', d: 'Recordatorios y cobro de renta sin perseguir a nadie por chat.', via: 'vía WhatsApp' },
    { n: '04', t: 'Mantenimiento', d: 'Reportes, tareas y checklist de turnover en una sola cola.', via: null },
  ]
  return (
    <section id="plataforma" style={{ padding: '64px 0', borderTop: '1px solid var(--mkt-line)' }}>
      <div className="mkt-wrap">
        <SectionHead num="02" kicker="La plataforma" title="Un sistema. No un mosaico de herramientas." />
        <p style={{ fontSize: 15.5, color: 'var(--mkt-text-2)', maxWidth: 560, marginBottom: 32 }}>
          Cuatro módulos sobre la misma base de datos, para cada propiedad.
          Nada que sincronizar, nada que se pierda entre apps.
        </p>
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', marginBottom: 24 }}>
          {modulos.map((m) => (
            <div key={m.n} className="mkt-card" style={{ padding: 20 }}>
              <div style={{ fontFamily: 'var(--mkt-mono)', fontSize: 11, color: 'var(--mkt-accent-soft)', marginBottom: 10 }}>
                {m.n}
              </div>
              <h3 style={{ fontSize: 17, marginBottom: 8 }}>{m.t}</h3>
              <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--mkt-text-2)' }}>{m.d}</p>
              {m.via && (
                <p style={{ marginTop: 10, fontFamily: 'var(--mkt-mono)', fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--mkt-text-4)' }}>
                  {m.via}
                </p>
              )}
            </div>
          ))}
        </div>
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            gap: 24,
            flexWrap: 'wrap',
            fontFamily: 'var(--mkt-mono)',
            fontSize: 11.5,
            letterSpacing: '0.06em',
            color: 'var(--mkt-text-3)',
          }}
        >
          <li>✓ Una sola base de datos</li>
          <li>✓ Multi-tenant</li>
          <li>✓ STR · MTR · LTR desde el mismo inventario</li>
        </ul>
      </div>
    </section>
  )
}

function IaNativa() {
  return (
    <section id="ia" style={{ padding: '64px 0', borderTop: '1px solid var(--mkt-line)' }}>
      <div className="mkt-wrap">
        <SectionHead num="03" kicker="Cómo piensa el sistema" title="La API opera. La interfaz supervisa." />
        <div style={{ display: 'grid', gap: 40, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 18 }}>
            <p style={{ fontSize: 15.5, lineHeight: 1.65, color: 'var(--mkt-text-2)' }}>
              Un equipo de agentes de IA opera sobre la API — cobra, agenda,
              redacta, da seguimiento. Ninguna acción que importe se ejecuta
              sin un humano.
            </p>
            <p
              style={{
                fontFamily: 'var(--mkt-mono)',
                fontSize: 13,
                color: 'var(--mkt-agent-soft)',
                background: 'var(--mkt-agent-tint)',
                border: '1px solid var(--mkt-line)',
                borderRadius: 8,
                padding: '12px 16px',
              }}
            >
              detecta → propone → apruebas → ejecuta{' '}
              <span style={{ color: 'var(--mkt-text-3)' }}>· reversible 15 min</span>
            </p>
            <p style={{ fontSize: 15.5, lineHeight: 1.65, color: 'var(--mkt-text-2)' }}>
              La interfaz no es el punto de partida: es donde supervisas lo que
              ya está pasando. Revisas el plan, no cada envío — puedes ajustar,
              aprobar o descartar.
            </p>
          </div>

          <figure style={{ margin: 0 }}>
            <div className="mkt-card" style={{ padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontFamily: 'var(--mkt-mono)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--mkt-agent-soft)' }}>
                  Agente · Cobranza
                </span>
                <span
                  style={{
                    fontFamily: 'var(--mkt-mono)',
                    fontSize: 10,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--mkt-text-3)',
                    border: '1px solid var(--mkt-line-2)',
                    borderRadius: 999,
                    padding: '2px 8px',
                  }}
                >
                  Pending
                </span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--mkt-text-3)', marginBottom: 8 }}>
                Portafolio · seguimiento de pagos
              </p>
              <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--mkt-text)', marginBottom: 12 }}>
                Propone una secuencia de recordatorios para las unidades con
                pagos atrasados, escalonada en tres días hábiles.
              </p>
              <p style={{ fontFamily: 'var(--mkt-mono)', fontSize: 10.5, color: 'var(--mkt-text-4)', marginBottom: 16 }}>
                conf 0.94 · reversible 15 min · audit log
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <span className="mkt-btn mkt-btn-ghost" style={{ padding: '7px 14px', fontSize: 12.5 }}>Descartar</span>
                <span className="mkt-btn mkt-btn-primary" style={{ padding: '7px 14px', fontSize: 12.5 }}>Aprobar</span>
              </div>
            </div>
            <figcaption style={{ marginTop: 10, fontSize: 12, color: 'var(--mkt-text-4)', textAlign: 'center' }}>
              Así se ve una propuesta real, esperando tu decisión.
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  )
}

function Live809() {
  return (
    <section style={{ padding: '64px 0', borderTop: '1px solid var(--mkt-line)' }}>
      <div className="mkt-wrap" style={{ display: 'grid', gap: 32, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'center' }}>
        <div>
          <p className="mkt-kicker" style={{ marginBottom: 14 }}>
            <span style={{ color: 'var(--mkt-ok-soft)' }}>●</span> En operación · en vivo
          </p>
          <h2 style={{ fontSize: 'clamp(28px, 3.6vw, 40px)', marginBottom: 16 }}>
            809 es el primer cliente. Y el <span className="mkt-serif" style={{ color: 'var(--mkt-accent-soft)' }}>laboratorio permanente</span>.
          </h2>
          <p style={{ fontSize: 15.5, lineHeight: 1.65, color: 'var(--mkt-text-2)', maxWidth: 520, marginBottom: 24 }}>
            Antes de venderse como software, BaW OS opera 809 todos los días —
            reservas, contratos, cobros y mantenimiento en producción. Cada
            versión nueva se prueba ahí antes que en ningún otro lugar.
          </p>
          <a href="https://809.mx" className="mkt-btn mkt-btn-ghost">Conocer el edificio ↗</a>
        </div>
        <div className="mkt-card" style={{ padding: 24, background: 'var(--mkt-accent-tint)' }}>
          <h3 style={{ fontSize: 18, marginBottom: 10 }}>¿Vienes a reservar o rentar?</h3>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--mkt-text-2)', marginBottom: 16 }}>
            Estás en la página del software que opera el edificio. Las
            estancias, precios y disponibilidad viven en el sitio de 809.
          </p>
          <a href="https://809.mx" className="mkt-btn mkt-btn-primary">Reservar en 809.mx</a>
        </div>
      </div>
    </section>
  )
}

function Interes() {
  return (
    <section id="interes" style={{ padding: '64px 0', borderTop: '1px solid var(--mkt-line)' }}>
      <div className="mkt-wrap" style={{ maxWidth: 720 }}>
        <p className="mkt-kicker" style={{ marginBottom: 14 }}>Para operadoras LATAM</p>
        <h2 style={{ fontSize: 'clamp(28px, 3.6vw, 40px)', marginBottom: 16 }}>¿Operas propiedades?</h2>
        <p style={{ fontSize: 15.5, lineHeight: 1.65, color: 'var(--mkt-text-2)', marginBottom: 24 }}>
          Súmate a la lista de interés — avisamos primero a quien ya levantó la
          mano cuando abramos acceso. ¿Quieres conocer más? Escríbenos a{' '}
          <a href="mailto:admin@baw.mx" style={{ color: 'var(--mkt-accent-soft)' }}>admin@baw.mx</a>.
        </p>
        <InterestForm />
        <p style={{ marginTop: 12, fontSize: 12, color: 'var(--mkt-text-4)' }}>
          Sin spam. Un correo cuando haya acceso.
        </p>
      </div>
    </section>
  )
}

function FooterMkt() {
  return (
    <footer style={{ borderTop: '1px solid var(--mkt-line)', padding: '48px 0 32px' }}>
      <div className="mkt-wrap" style={{ display: 'grid', gap: 32, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div>
          <BawWordmark size={16} />
          <p style={{ marginTop: 12, fontSize: 13, lineHeight: 1.6, color: 'var(--mkt-text-3)', maxWidth: 260 }}>
            Software de administración inmobiliaria, hecho operando un edificio
            real.
          </p>
        </div>
        <div>
          <p className="mkt-kicker" style={{ marginBottom: 10 }}>Producto</p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 13.5, color: 'var(--mkt-text-2)', display: 'grid', gap: 6 }}>
            <li><a href="#plataforma">Plataforma</a></li>
            <li><a href="#ia">IA nativa</a></li>
            <li><a href="https://github.com/zxy-vc" target="_blank" rel="noopener noreferrer">GitHub ↗</a></li>
          </ul>
        </div>
        <div>
          <p className="mkt-kicker" style={{ marginBottom: 10 }}>Contacto</p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 13.5, color: 'var(--mkt-text-2)', display: 'grid', gap: 6 }}>
            <li><a href="mailto:admin@baw.mx">admin@baw.mx</a></li>
          </ul>
        </div>
        <div>
          <p className="mkt-kicker" style={{ marginBottom: 10 }}>¿Buscas reservar?</p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 13.5, color: 'var(--mkt-text-2)' }}>
            <li><a href="https://809.mx">809.mx ↗</a></li>
          </ul>
        </div>
      </div>
      <div className="mkt-wrap" style={{ marginTop: 36, paddingTop: 18, borderTop: '1px solid var(--mkt-line)', fontSize: 12, color: 'var(--mkt-text-4)' }}>
        © {new Date().getFullYear()} BaW OS
      </div>
    </footer>
  )
}
