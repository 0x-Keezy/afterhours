import { describe, expect, it } from 'vitest'
import type { Sample } from './types'
import { archiveStats } from './archive'

const T = 1788239520
const s = (t: number, symbol = 'NVDA'): Sample => ({
  t, symbol, onchain: 100, reference: 100, gapPct: -0.2,
  liquidityUsd: 1, volume24h: 0, status: 'closed',
})

describe('archiveStats', () => {
  it('sin archivo no inventa fechas', () => {
    expect(archiveStats([])).toEqual({ samples: 0, firstSampleAt: null, lastSampleAt: null, gaps: [] })
  })

  it('cuenta las muestras y marca desde cuándo', () => {
    const r = archiveStats([s(T), s(T + 900), s(T + 1800)])
    expect(r).toMatchObject({ samples: 3, firstSampleAt: T, lastSampleAt: T + 1800, gaps: [] })
  })

  it('no cuenta dos veces el mismo instante por tener varios tickers', () => {
    const r = archiveStats([s(T, 'NVDA'), s(T, 'TSLA'), s(T + 900, 'NVDA')])
    expect(r.samples).toBe(3)
    expect(r.gaps).toEqual([])
  })

  it('delata el hueco cuando el poller se salteó una corrida', () => {
    // falta la muestra de T+900
    const r = archiveStats([s(T), s(T + 1800)])
    expect(r.gaps).toEqual([{ from: T, to: T + 1800, missedSamples: 1 }])
  })

  it('cuenta cuántas corridas se perdieron en un hueco largo', () => {
    const r = archiveStats([s(T), s(T + 900 * 5)])
    expect(r.gaps).toEqual([{ from: T, to: T + 4500, missedSamples: 4 }])
  })

  it('tolera el jitter del cron sin inventar un hueco', () => {
    // GitHub Actions no dispara al segundo: 15 min ± unos minutos no es un hueco
    const r = archiveStats([s(T), s(T + 1100)])
    expect(r.gaps).toEqual([])
  })

  it('ordena aunque las muestras lleguen desordenadas', () => {
    const r = archiveStats([s(T + 1800), s(T)])
    expect(r.firstSampleAt).toBe(T)
    expect(r.lastSampleAt).toBe(T + 1800)
  })
})
