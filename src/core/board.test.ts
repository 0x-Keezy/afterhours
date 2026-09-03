import { describe, expect, it } from 'vitest'
import type { Sample } from './types'
import { buildBoard, quietoDesde } from './board'
import { MIN_SAMPLES } from './gap'

const T = 1788239520
const s = (symbol: string, gapPct: number, t = T): Sample => ({
  t, symbol, onchain: 100, reference: 100, gapPct,
  liquidityUsd: symbol === 'NVDA' ? 5270875 : 56787, volume24h: 0, status: 'closed',
})

describe('buildBoard', () => {
  it('marca calibrando y no publica z cuando falta historia', () => {
    const b = buildBoard([s('NVDA', -0.2)], [s('NVDA', -0.2)], T)
    expect(b.rows[0]).toMatchObject({ symbol: 'NVDA', z: null, calibrating: true })
    expect(b.rows[0]!.progress).toBeCloseTo(1 / MIN_SAMPLES, 6)
  })

  it('publica el z cuando hay historia suficiente', () => {
    const hist = Array.from({ length: MIN_SAMPLES }, (_, i) => s('NVDA', i % 2 === 0 ? -0.3 : -0.1, T - i * 900))
    const b = buildBoard(hist, [s('NVDA', -0.9)], T)
    expect(b.rows[0]!.calibrating).toBe(false)
    expect(b.rows[0]!.z).toBeCloseTo(-4.72, 2)
  })

  it('ordena por anomalía y no por magnitud bruta', () => {
    const hist = [
      ...Array.from({ length: MIN_SAMPLES }, (_, i) => s('NVDA', i % 2 === 0 ? -0.02 : 0.02, T - i * 900)),
      ...Array.from({ length: MIN_SAMPLES }, (_, i) => s('COIN', i % 2 === 0 ? -0.9 : -0.7, T - i * 900)),
    ]
    // COIN tiene el gap más grande, pero es su estado normal; el raro es NVDA.
    const b = buildBoard(hist, [s('NVDA', -0.30), s('COIN', -0.85)], T)
    expect(b.rows.map((r) => r.symbol)).toEqual(['NVDA', 'COIN'])
  })

  it('los que todavía calibran van después de los que tienen z', () => {
    const hist = Array.from({ length: MIN_SAMPLES }, (_, i) => s('NVDA', i % 2 === 0 ? -0.3 : -0.1, T - i * 900))
    const b = buildBoard([...hist, s('COIN', -0.8)], [s('COIN', -0.8), s('NVDA', -0.9)], T)
    expect(b.rows.map((r) => r.symbol)).toEqual(['NVDA', 'COIN'])
  })
})

describe('orderedBy — la página no puede afirmar un orden que no tiene', () => {
  it('con todo calibrando NO puede decir que ordena por anomalía', () => {
    const b = buildBoard([s('NVDA', -0.2), s('COIN', -0.8)], [s('NVDA', -0.2), s('COIN', -0.8)], T)
    expect(b.orderedBy).toBe('liquidity')
  })

  it('con todo calibrando ordena por liquidez de forma determinista', () => {
    // COIN llega primero en la lista pero NVDA es 90x más líquido
    const b = buildBoard([s('COIN', -0.8), s('NVDA', -0.2)], [s('COIN', -0.8), s('NVDA', -0.2)], T)
    expect(b.rows.map((r) => r.symbol)).toEqual(['NVDA', 'COIN'])
  })

  it('en cuanto un ticker tiene banda, el orden pasa a ser por anomalía', () => {
    const hist = Array.from({ length: MIN_SAMPLES }, (_, i) => s('NVDA', i % 2 === 0 ? -0.3 : -0.1, T - i * 900))
    const b = buildBoard(hist, [s('NVDA', -0.9)], T)
    expect(b.orderedBy).toBe('anomaly')
  })

  it('la serie de cada fila es cronológica y sólo de SU ticker', () => {
    // A propósito desordenadas y mezcladas: history no garantiza orden.
    const historia = [
      s('NVDA', -0.3, T - 900),
      s('COIN', 5.0, T - 1800),
      s('NVDA', -0.1, T - 2700),
      s('NVDA', -0.2, T),
    ]
    const b = buildBoard(historia, [s('NVDA', -0.2, T)], T)
    const fila = b.rows.find((r) => r.symbol === 'NVDA')!

    expect(fila.serie.map((p) => p.t)).toEqual([T - 2700, T - 900, T])
    expect(fila.serie.map((p) => p.g)).toEqual([-0.1, -0.3, -0.2])
    // El 5.0 de COIN no puede filtrarse a la serie de NVDA.
    expect(fila.serie.some((p) => p.g === 5.0)).toBe(false)
  })

  it('la serie lleva el instante, no sólo el valor, para no dibujar huecos como continuos', () => {
    const conHueco = [s('NVDA', 0.1, T - 7200), s('NVDA', 0.2, T)]
    const b = buildBoard(conHueco, [s('NVDA', 0.2, T)], T)
    const serie = b.rows[0].serie

    // Dos puntos separados por dos horas: quien dibuje debe poder verlo.
    expect(serie).toHaveLength(2)
    expect(serie[1].t - serie[0].t).toBe(7200)
  })
})

describe('quietoDesde', () => {
  const pt = (t: number, p: number) => ({ t, p })

  it('devuelve null si el precio cambió en la última lectura', () => {
    expect(quietoDesde([pt(1, 10), pt(2, 10), pt(3, 11)])).toBeNull()
  })

  it('devuelve el instante de la PRIMERA lectura de la racha final', () => {
    // 10 10 10 -> la racha arranca en t=2, no en t=1 (t=1 vale 9)
    expect(quietoDesde([pt(1, 9), pt(2, 10), pt(3, 10), pt(4, 10)])).toBe(2)
  })

  it('con una sola lectura no puede probar quietud', () => {
    expect(quietoDesde([pt(1, 10)])).toBeNull()
    expect(quietoDesde([])).toBeNull()
  })

  it('si NUNCA cambió, la racha arranca en la primera lectura', () => {
    expect(quietoDesde([pt(5, 1.48), pt(6, 1.48), pt(7, 1.48)])).toBe(5)
  })

  it('no confunde una repetición vieja con la racha final', () => {
    // 7 7 8 8: la racha final son los dos 8, no los 7
    expect(quietoDesde([pt(1, 7), pt(2, 7), pt(3, 8), pt(4, 8)])).toBe(3)
  })
})

describe('buildBoard · stillSince', () => {
  const conPrecio = (symbol: string, t: number, onchain: number): Sample => ({
    ...s(symbol, 0.5, t),
    onchain,
  })

  it('marca la fila cuyo precio on-chain no se movió', () => {
    // El caso real: GPRO clavado en 1.48 durante toda la ventana.
    const hist = [
      conPrecio('GPRO', T - 2700, 1.48),
      conPrecio('GPRO', T - 1800, 1.48),
      conPrecio('GPRO', T - 900, 1.48),
      conPrecio('GPRO', T, 1.48),
      conPrecio('NVDA', T - 900, 220.1),
      conPrecio('NVDA', T, 220.9),
    ]
    const b = buildBoard(hist, [conPrecio('GPRO', T, 1.48), conPrecio('NVDA', T, 220.9)], T)
    const gpro = b.rows.find((r) => r.symbol === 'GPRO')!
    const nvda = b.rows.find((r) => r.symbol === 'NVDA')!
    expect(gpro.stillSince).toBe(T - 2700)
    expect(nvda.stillSince).toBeNull()
  })

  it('no mete el precio dentro de `serie`: lo que viaja al cliente es el derivado', () => {
    const b = buildBoard([conPrecio('GPRO', T, 1.48)], [conPrecio('GPRO', T, 1.48)], T)
    expect(Object.keys(b.rows[0]!.serie[0]!).sort()).toEqual(['g', 't'])
  })
})
