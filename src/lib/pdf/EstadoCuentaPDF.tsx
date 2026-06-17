/* eslint-disable jsx-a11y/alt-text */
// BaW OS — Documento PDF del Estado de Cuenta (react-pdf).
// Replica el mockup aprobado en la línea gráfica de BaW OS: indigo 266,
// Inter (texto) + IBM Plex Mono (importes/IDs) + Instrument Serif (número hero),
// light mode, "Mateos 809" dominante y "Operado con BaW OS" discreto al pie.
//
// Las fuentes van empaquetadas en src/lib/pdf/fonts (ttf). El registro se
// envuelve en try/catch: si una fuente falla, react-pdf cae a su default sin
// romper la generación.

import path from 'path'
import React from 'react'
import { Document, Page, View, Text, StyleSheet, Font } from '@react-pdf/renderer'
import type { EstadoCuentaDoc } from '@/lib/estado-cuenta'

const FONT_DIR = path.join(process.cwd(), 'src/lib/pdf/fonts')
const f = (name: string) => path.join(FONT_DIR, name)

let fontsReady = false
function ensureFonts() {
  if (fontsReady) return
  try {
    Font.register({
      family: 'Inter',
      fonts: [
        { src: f('inter-latin-400-normal.ttf'), fontWeight: 400 },
        { src: f('inter-latin-500-normal.ttf'), fontWeight: 500 },
        { src: f('inter-latin-600-normal.ttf'), fontWeight: 600 },
        { src: f('inter-latin-700-normal.ttf'), fontWeight: 700 },
      ],
    })
    Font.register({
      family: 'IBMPlexMono',
      fonts: [
        { src: f('ibm-plex-mono-latin-400-normal.ttf'), fontWeight: 400 },
        { src: f('ibm-plex-mono-latin-500-normal.ttf'), fontWeight: 500 },
        { src: f('ibm-plex-mono-latin-600-normal.ttf'), fontWeight: 600 },
      ],
    })
    Font.register({
      family: 'InstrumentSerif',
      fonts: [{ src: f('instrument-serif-latin-400-normal.ttf'), fontWeight: 400 }],
    })
    fontsReady = true
  } catch {
    // Sin fuentes de marca: react-pdf usa Helvetica. El documento sigue generándose.
  }
}

// ── Paleta (tokens OKLCH → hex) ──────────────────────────────────────────────
const C = {
  text: '#181b20',
  text2: '#4a4d54',
  text3: '#767a83',
  text4: '#a1a5ab',
  bg: '#fcfcfe',
  surface2: '#f9fafc',
  line: '#e4e6e9',
  line2: '#d5d7db',
  brand050: '#f1f7ff',
  brand100: '#dfebff',
  brand500: '#3f6cf4',
  brand600: '#2d57e5',
  red100: '#ffe6e3',
  red500: '#df202e',
  amber100: '#fef0d4',
  amber600: '#9d6400',
  green100: '#d7f4e0',
  green600: '#008140',
  white: '#ffffff',
}

function fmt(n: number): string {
  const v = Math.abs(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `$${v}`
}
function fmtDate(iso: string): string {
  // 'YYYY-MM-DD' → 'DD mmm'
  const [, m, d] = iso.split('-')
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${d} ${meses[Number(m) - 1] || ''}`
}
function fmtLong(iso: string): string {
  const [y, m, d] = iso.split('-')
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return `${Number(d)} de ${meses[Number(m) - 1]} ${y}`
}
const MESES_CAP = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
function periodoLabel(periodo: string): string {
  const [y, m] = periodo.split('-')
  return `${MESES_CAP[Number(m) - 1]} ${y}`
}

const s = StyleSheet.create({
  page: { backgroundColor: C.white, fontFamily: 'Inter', fontSize: 10, color: C.text, paddingBottom: 56 },
  monoLabel: { fontFamily: 'IBMPlexMono', fontSize: 8, letterSpacing: 1, color: C.text3, textTransform: 'uppercase' },
  mono: { fontFamily: 'IBMPlexMono' },

  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 36, paddingTop: 34, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: C.line },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  mark: { width: 44, height: 44, borderRadius: 6, backgroundColor: C.text, color: C.white, fontFamily: 'IBMPlexMono', fontWeight: 600, fontSize: 16, textAlign: 'center', paddingTop: 13, marginRight: 12 },
  brandName: { fontSize: 16, fontWeight: 600, color: C.text },
  brandAddr: { fontSize: 9, color: C.text3, marginTop: 3 },
  docMeta: { alignItems: 'flex-end' },
  folio: { fontFamily: 'IBMPlexMono', fontSize: 10, color: C.text2, marginTop: 6 },
  folioSub: { fontSize: 9, color: C.text2, marginTop: 3 },

  hero: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 36, paddingVertical: 20, backgroundColor: C.surface2, borderBottomWidth: 1, borderBottomColor: C.line },
  amount: { fontFamily: 'InstrumentSerif', fontSize: 42, color: C.text },
  due: { fontSize: 9, color: C.text3, marginTop: 6 },
  chip: { fontSize: 9, fontWeight: 500, color: C.red500, backgroundColor: C.red100, borderRadius: 9999, paddingVertical: 3, paddingHorizontal: 9 },

  meta: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 36, paddingTop: 18 },
  metaP: { fontSize: 10, color: C.text2, marginTop: 3 },
  metaStrong: { color: C.text, fontWeight: 600 },

  sec: { fontFamily: 'IBMPlexMono', fontSize: 8, letterSpacing: 1, color: C.text3, textTransform: 'uppercase', marginHorizontal: 36, marginTop: 20, marginBottom: 8 },

  summary: { marginHorizontal: 36, borderWidth: 1, borderColor: C.line, borderRadius: 6 },
  sRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.line },
  sRowLast: { borderBottomWidth: 0 },
  sLabel: { fontSize: 10, color: C.text2 },
  sVal: { fontFamily: 'IBMPlexMono', fontSize: 10, color: C.text2 },
  totalRow: { backgroundColor: C.brand050, borderBottomWidth: 0 },
  totalLabel: { fontSize: 10.5, color: C.text, fontWeight: 600 },
  totalVal: { fontFamily: 'IBMPlexMono', fontSize: 11, color: C.brand600, fontWeight: 600 },

  table: { marginHorizontal: 36 },
  th: { flexDirection: 'row', borderBottomWidth: 1.5, borderBottomColor: C.line2, paddingVertical: 6, paddingHorizontal: 2 },
  thCell: { fontFamily: 'IBMPlexMono', fontSize: 7.5, letterSpacing: 0.5, color: C.text3, textTransform: 'uppercase' },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 7, paddingHorizontal: 2 },
  trPartial: { backgroundColor: '#fdf6e6' },
  cDate: { width: '13%', fontFamily: 'IBMPlexMono', fontSize: 9, color: C.text2 },
  cConcept: { width: '47%', fontSize: 9.5, color: C.text },
  cNum: { width: '13.33%', fontFamily: 'IBMPlexMono', fontSize: 9, color: C.text2, textAlign: 'right' },
  tag: { fontFamily: 'Inter', fontSize: 7.5, fontWeight: 500, borderRadius: 9999, paddingHorizontal: 5, paddingVertical: 1 },

  aging: { flexDirection: 'row', marginHorizontal: 36 },
  ageCell: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 6, padding: 9, marginRight: 6 },
  ageCellHot: { borderColor: C.red500, backgroundColor: '#fff3f1' },
  ageK: { fontFamily: 'IBMPlexMono', fontSize: 7.5, color: C.text3, textTransform: 'uppercase' },
  ageV: { fontFamily: 'IBMPlexMono', fontSize: 12, color: C.text, marginTop: 4 },
  ageVHot: { color: C.red500 },

  pay: { marginHorizontal: 36, marginTop: 18, borderWidth: 1, borderColor: C.brand100, backgroundColor: C.brand050, borderRadius: 6, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payK: { fontFamily: 'IBMPlexMono', fontSize: 8, letterSpacing: 0.5, color: C.brand600, textTransform: 'uppercase' },
  payP: { fontSize: 10, color: C.text2, marginTop: 5 },
  payTotalV: { fontFamily: 'IBMPlexMono', fontSize: 17, fontWeight: 600, color: C.brand600, marginTop: 4 },

  note: { marginHorizontal: 36, marginTop: 16, fontSize: 8, color: C.text4, lineHeight: 1.5 },

  foot: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 36, paddingVertical: 14, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.surface2, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footB: { fontSize: 8, color: C.text3 },
  footBaw: { fontFamily: 'IBMPlexMono', fontSize: 8, letterSpacing: 0.5, color: C.text4 },
  footBawB: { color: C.text3, fontWeight: 600 },
})

function tagStyle(kind: 'partial' | 'late') {
  return kind === 'partial'
    ? { ...s.tag, backgroundColor: C.amber100, color: C.amber600 }
    : { ...s.tag, backgroundColor: C.red100, color: C.red500 }
}

export function EstadoCuentaPDF({ doc }: { doc: EstadoCuentaDoc }) {
  ensureFonts()
  const { data } = doc
  const markText = doc.buildingName.replace(/\D/g, '').slice(0, 3) || doc.buildingName.slice(0, 3).toUpperCase()
  const dueDate = (() => {
    // Día de pago = día 5 del mes siguiente al corte.
    const [y, m] = data.corte.split('-').map(Number)
    const next = new Date(y, m, 5) // m es 1-based → Date(m) = mes siguiente
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-05`
  })()

  return (
    <Document title={`Estado de cuenta ${doc.folio}`} author={doc.buildingName}>
      <Page size="LETTER" style={s.page}>
        {/* Header */}
        <View style={s.head}>
          <View style={s.brandRow}>
            <Text style={s.mark}>{markText}</Text>
            <View>
              <Text style={s.brandName}>{doc.buildingName}</Text>
              {doc.buildingAddress ? <Text style={s.brandAddr}>{doc.buildingAddress}</Text> : null}
            </View>
          </View>
          <View style={s.docMeta}>
            <Text style={s.monoLabel}>Estado de cuenta</Text>
            <Text style={s.folio}>{doc.folio}</Text>
            <Text style={s.folioSub}>Periodo: {periodoLabel(data.periodo)}</Text>
          </View>
        </View>

        {/* Hero */}
        <View style={s.hero}>
          <View>
            <Text style={s.monoLabel}>Saldo total a pagar</Text>
            <Text style={s.amount}>{fmt(data.saldoTotal)}</Text>
            <Text style={s.due}>Vence el {fmtLong(dueDate)} · MXN</Text>
          </View>
          {data.diasAtrasoMax > 0 ? (
            <Text style={s.chip}>{data.diasAtrasoMax} días de atraso</Text>
          ) : null}
        </View>

        {/* Meta */}
        <View style={s.meta}>
          <View>
            <Text style={s.monoLabel}>Inquilino</Text>
            <Text style={[s.metaP, s.metaStrong]}>{doc.tenantName}</Text>
            <Text style={s.metaP}>Departamento {doc.unitNumber}</Text>
            <Text style={[s.metaP, s.mono, { fontSize: 9 }]}>Contrato {doc.contractId.slice(0, 8).toUpperCase()}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.monoLabel}>Emisión</Text>
            <Text style={s.metaP}>Fecha de corte: {fmtLong(data.corte)}</Text>
            <Text style={s.metaP}>Emitido: {fmtLong(doc.emittedAt.slice(0, 10))}</Text>
            <Text style={s.metaP}>Día de pago: 5 de cada mes</Text>
          </View>
        </View>

        {/* Resumen */}
        <Text style={s.sec}>Resumen</Text>
        <View style={s.summary}>
          <View style={s.sRow}>
            <Text style={s.sLabel}>Saldo anterior</Text>
            <Text style={s.sVal}>{fmt(data.saldoAnterior)}</Text>
          </View>
          <View style={s.sRow}>
            <Text style={s.sLabel}>Cargos del periodo</Text>
            <Text style={s.sVal}>{fmt(data.cargosPeriodo)}</Text>
          </View>
          <View style={s.sRow}>
            <Text style={s.sLabel}>Pagos recibidos</Text>
            <Text style={[s.sVal, { color: C.green600 }]}>− {fmt(data.pagosRecibidos)}</Text>
          </View>
          <View style={s.sRow}>
            <Text style={s.sLabel}>Recargos por mora</Text>
            <Text style={[s.sVal, { color: C.red500 }]}>{fmt(data.recargos)}</Text>
          </View>
          <View style={[s.sRow, s.totalRow]}>
            <Text style={s.totalLabel}>Saldo total a pagar</Text>
            <Text style={s.totalVal}>{fmt(data.saldoTotal)}</Text>
          </View>
        </View>

        {/* Movimientos */}
        <Text style={s.sec}>Detalle de movimientos</Text>
        <View style={s.table}>
          <View style={s.th}>
            <Text style={[s.thCell, { width: '13%' }]}>Fecha</Text>
            <Text style={[s.thCell, { width: '47%' }]}>Concepto</Text>
            <Text style={[s.thCell, { width: '13.33%', textAlign: 'right' }]}>Cargo</Text>
            <Text style={[s.thCell, { width: '13.33%', textAlign: 'right' }]}>Abono</Text>
            <Text style={[s.thCell, { width: '13.33%', textAlign: 'right' }]}>Saldo</Text>
          </View>
          {data.movimientos.map((mv, i) => (
            <View key={i} style={mv.partial ? [s.tr, s.trPartial] : s.tr}>
              <Text style={s.cDate}>{mv.kind === 'opening' ? '' : fmtDate(mv.date)}</Text>
              <View style={{ width: '47%', flexDirection: 'row', alignItems: 'center' }}>
                <Text style={s.cConcept}>{mv.concept}</Text>
                {mv.partial ? <Text style={tagStyle('partial')}> parcial</Text> : null}
                {mv.kind === 'late_fee' && mv.level ? <Text style={tagStyle('late')}> mora</Text> : null}
              </View>
              <Text style={[s.cNum, mv.kind === 'late_fee' ? { color: C.red500 } : {}]}>{mv.charge ? fmt(mv.charge) : '—'}</Text>
              <Text style={[s.cNum, mv.credit ? { color: C.green600 } : {}]}>{mv.credit ? fmt(mv.credit) : '—'}</Text>
              <Text style={s.cNum}>{fmt(mv.balance)}</Text>
            </View>
          ))}
        </View>

        {/* Aging */}
        <Text style={s.sec}>Antigüedad del saldo</Text>
        <View style={s.aging}>
          {[
            { k: 'Corriente', v: data.aging.corriente, hot: false },
            { k: '1 – 15 días', v: data.aging.d1_15, hot: data.aging.d1_15 > 0 },
            { k: '16 – 30 días', v: data.aging.d16_30, hot: data.aging.d16_30 > 0 },
            { k: '31+ días', v: data.aging.d31_plus, hot: data.aging.d31_plus > 0 },
          ].map((b, i) => (
            <View key={i} style={b.hot ? [s.ageCell, s.ageCellHot] : s.ageCell}>
              <Text style={s.ageK}>{b.k}</Text>
              <Text style={b.hot ? [s.ageV, s.ageVHot] : s.ageV}>{fmt(b.v)}</Text>
            </View>
          ))}
        </View>

        {/* Datos de pago */}
        <View style={s.pay}>
          <View>
            <Text style={s.payK}>Datos para pago</Text>
            <Text style={s.payP}>Referencia <Text style={s.mono}>{doc.unitNumber}-{data.periodo}</Text></Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.payK}>Total a pagar</Text>
            <Text style={s.payTotalV}>{fmt(data.saldoTotal)}</Text>
          </View>
        </View>

        <Text style={s.note}>
          El recargo por mora aplica 5% entre 6 y 15 días de atraso, y 10% a partir de 16 días, sobre la mensualidad vencida.
        </Text>

        {/* Footer endorsement */}
        <View style={s.foot} fixed>
          <Text style={s.footB}>
            {doc.buildingName}
            {doc.buildingAddress ? ` · ${doc.buildingAddress}` : ''}
          </Text>
          <Text style={s.footBaw}>
            Operado con <Text style={s.footBawB}>BaW OS</Text>
          </Text>
        </View>
      </Page>
    </Document>
  )
}
