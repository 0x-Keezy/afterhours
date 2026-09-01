import { appendFile, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Sample } from '../core/types.js'
import { appendSamples, compactDay, dayKey, pruneRaw, readDay, readRecent, summarize } from './jsonl.js'

const T = 1788239520 // 2026-09-01 UTC, hora de la medición real
const s = (over: Partial<Sample> = {}): Sample => ({
  t: T, symbol: 'NVDA', onchain: 220.31, reference: 220.78, gapPct: -0.2129,
  liquidityUsd: 5270875, volume24h: 34261770, status: 'closed', ...over,
})
const dir = () => mkdtemp(join(tmpdir(), 'afterhours-'))

describe('dayKey', () => {
  it('usa UTC, no la hora local', () => {
    expect(dayKey(T)).toBe('2026-09-01')
  })
})

describe('append y lectura', () => {
  it('escribe una línea por muestra y la relee igual', async () => {
    const d = await dir()
    await appendSamples(d, [s(), s({ symbol: 'TSLA' })])
    expect(await readDay(d, '2026-09-01')).toEqual([s(), s({ symbol: 'TSLA' })])
  })

  it('agrega sin pisar lo ya escrito', async () => {
    const d = await dir()
    await appendSamples(d, [s()])
    await appendSamples(d, [s({ symbol: 'SPY' })])
    expect((await readDay(d, '2026-09-01')).map((x) => x.symbol)).toEqual(['NVDA', 'SPY'])
  })

  it('un día sin archivo devuelve vacío en vez de reventar', async () => {
    expect(await readDay(await dir(), '2020-01-01')).toEqual([])
  })

  it('ignora una línea corrupta en vez de perder el día entero', async () => {
    const d = await dir()
    await appendSamples(d, [s()])
    await appendFile(join(d, 'raw', '2026-09-01.jsonl'), '{roto\n')
    expect(await readDay(d, '2026-09-01')).toHaveLength(1)
  })

  it('readRecent junta los días de la ventana pedida', async () => {
    const d = await dir()
    await appendSamples(d, [s({ t: T - 86400 }), s()])
    expect(await readRecent(d, 2, T)).toHaveLength(2)
    expect(await readRecent(d, 1, T)).toHaveLength(1)
  })
})

describe('summarize', () => {
  it('resume por símbolo con apertura, cierre, extremos y mediana', () => {
    const out = summarize('2026-09-01', [
      s({ t: T, gapPct: -0.2 }), s({ t: T + 900, gapPct: -0.6 }), s({ t: T + 1800, gapPct: -0.4 }),
    ])
    expect(out).toEqual([{
      day: '2026-09-01', symbol: 'NVDA', n: 3,
      open: -0.2, close: -0.4, min: -0.6, max: -0.2, median: -0.4,
      liquidityUsd: 5270875,
    }])
  })

  it('ordena por tiempo antes de decidir apertura y cierre', () => {
    const out = summarize('2026-09-01', [s({ t: T + 900, gapPct: -0.6 }), s({ t: T, gapPct: -0.2 })])
    expect(out[0]!.open).toBe(-0.2)
    expect(out[0]!.close).toBe(-0.6)
  })
})

describe('compactDay y pruneRaw', () => {
  it('escribe el resumen del día en daily/', async () => {
    const d = await dir()
    await appendSamples(d, [s(), s({ t: T + 900, gapPct: -0.6 })])
    await compactDay(d, '2026-09-01')
    const txt = await readFile(join(d, 'daily', '2026-09.jsonl'), 'utf8')
    expect(JSON.parse(txt.trim())).toMatchObject({ day: '2026-09-01', symbol: 'NVDA', n: 2 })
  })

  it('borra el crudo más viejo que la ventana y devuelve qué borró', async () => {
    const d = await dir()
    await appendSamples(d, [s({ t: T - 20 * 86400 }), s()])
    const borrados = await pruneRaw(d, 14, T)
    expect(borrados).toEqual(['2026-08-12'])
    expect(await readDay(d, '2026-09-01')).toHaveLength(1)
  })
})
