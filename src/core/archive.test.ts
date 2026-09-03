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
    // Una corrida de un ticker a cada lado: 1 corrida perdida x 1 lectura.
    expect(r.gaps).toEqual([{ from: T, to: T + 1800, missedSamples: 1, lostReadings: 1 }])
  })

  it('cuenta cuántas corridas se perdieron en un hueco largo', () => {
    const r = archiveStats([s(T), s(T + 900 * 5)])
    expect(r.gaps).toEqual([{ from: T, to: T + 4500, missedSamples: 4, lostReadings: 4 }])
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


describe('archiveStats \u00b7 lecturas perdidas', () => {
  /** Una corrida de `n` tickers en el instante `t`. */
  const corrida = (t: number, n: number): Sample[] =>
    Array.from({ length: n }, (_, i) => s(t, `T${i}`))

  it('estima con el tamano de la lista EN EL HUECO, no con el de hoy', () => {
    // El bug real, medido el 2026-09-03: la pagina multiplicaba las corridas
    // perdidas por `board.rows.length` (la lista de HOY, 68) y decia 1.428
    // lecturas donde el archivo sostiene ~1.071. El censo crece con los dias,
    // asi que la constante del presente siempre sobrestima el pasado.
    const historia = [
      ...corrida(T, 48),
      // hueco de 21 corridas
      ...corrida(T + 900 * 22, 53),
      // y despues la lista crece a 68, que es lo que NO tiene que usarse
      ...corrida(T + 900 * 23, 68),
      ...corrida(T + 900 * 24, 68),
    ]
    const r = archiveStats(historia)
    const hueco = r.gaps.find((g) => g.missedSamples === 21)!
    expect(hueco).toBeDefined()
    // (48 + 53) / 2 = 50,5 -> 51 (Math.round del promedio, redondeo bancario no)
    expect(hueco.lostReadings).toBe(21 * Math.round((48 + 53) / 2))
    // Y sobre todo: NO es la cuenta con la lista de hoy.
    expect(hueco.lostReadings).not.toBe(21 * 68)
    expect(hueco.lostReadings).toBeLessThan(21 * 68)
  })

  it('dos huecos con las mismas corridas perdidas pueden perder distintas lecturas', () => {
    // Es lo que rompe el empate: la pagina decia "The longest" en singular y
    // habia DOS huecos de 21 corridas. Ordenar por lecturas da un unico peor.
    const historia = [
      ...corrida(T, 40),
      ...corrida(T + 900 * 22, 40),
      ...corrida(T + 900 * 23, 60),
      ...corrida(T + 900 * 45, 60),
    ]
    const r = archiveStats(historia)
    const de21 = r.gaps.filter((g) => g.missedSamples === 21)
    expect(de21).toHaveLength(2)
    expect(de21[0]!.lostReadings).toBe(21 * 40)
    expect(de21[1]!.lostReadings).toBe(21 * 60)
    // El peor por LECTURAS es el segundo, aunque empaten en corridas.
    const peor = r.gaps.reduce((a, b) => (b.lostReadings > a.lostReadings ? b : a))
    expect(peor.lostReadings).toBe(21 * 60)
  })

  it('un hueco entre dos corridas de distinto tamano promedia las dos puntas', () => {
    // Es lo mejor que el archivo puede testificar: nadie midio ADENTRO del hueco.
    const r = archiveStats([...corrida(T, 10), ...corrida(T + 900 * 4, 30)])
    const hueco = r.gaps[0]!
    expect(hueco.missedSamples).toBe(3)
    expect(hueco.lostReadings).toBe(3 * 20)
  })
})
