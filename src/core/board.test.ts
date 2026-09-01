import { describe, expect, it } from 'vitest'
import type { Sample } from './types'
import { buildBoard } from './board'
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
