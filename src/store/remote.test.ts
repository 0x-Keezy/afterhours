import { describe, expect, it } from 'vitest'
import type { Sample } from '../core/types'
import { readRecentRemote, readRecentRemoteDetallado, readUniverseRemote, rawUrl } from './remote'

const T = 1788239520 // 2026-09-01
const s = (t: number, symbol = 'NVDA'): Sample => ({
  t, symbol, onchain: 220.31, reference: 220.78, gapPct: -0.21,
  liquidityUsd: 1, volume24h: 0, status: 'closed',
})
const jsonl = (rows: Sample[]) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n'
const ok = (body: string) => new Response(body, { status: 200 })

describe('rawUrl', () => {
  it('apunta al raw de la rama por defecto', () => {
    expect(rawUrl('raw/2026-09-01.jsonl')).toBe(
      'https://raw.githubusercontent.com/0x-Keezy/afterhours/main/data/raw/2026-09-01.jsonl',
    )
  })
})

describe('readRecentRemote', () => {
  it('junta los días de la ventana pedida', async () => {
    const fetcher = async (url: string) =>
      url.includes('2026-09-01') ? ok(jsonl([s(T)])) : ok(jsonl([s(T - 86400, 'TSLA')]))
    const out = await readRecentRemote(fetcher, 2, T)
    expect(out.map((x) => x.symbol)).toEqual(['TSLA', 'NVDA'])
  })

  it('un día que todavía no existe es 404 y no rompe la corrida', async () => {
    const fetcher = async (url: string) =>
      url.includes('2026-09-01') ? ok(jsonl([s(T)])) : new Response('Not Found', { status: 404 })
    expect(await readRecentRemote(fetcher, 3, T)).toHaveLength(1)
  })

  it('una línea corrupta no cuesta el día entero', async () => {
    const fetcher = async () => ok(jsonl([s(T)]) + '{roto\n')
    expect(await readRecentRemote(fetcher, 1, T)).toHaveLength(1)
  })

  it('si la red falla entera devuelve vacío en vez de reventar la página', async () => {
    const fetcher = async () => {
      throw new Error('ENOTFOUND')
    }
    expect(await readRecentRemote(fetcher, 2, T)).toEqual([])
  })
})

describe('readUniverseRemote', () => {
  it('lee el censo publicado', async () => {
    const universo = { updatedAt: T, complete: false, pages: 120, entries: [] }
    const out = await readUniverseRemote(async () => ok(JSON.stringify(universo)))
    expect(out).toEqual(universo)
  })

  it('devuelve null si no está, en vez de inventar un censo vacío', async () => {
    expect(await readUniverseRemote(async () => new Response('nope', { status: 404 }))).toBeNull()
  })

  it('devuelve null si el JSON viene roto', async () => {
    expect(await readUniverseRemote(async () => ok('{roto'))).toBeNull()
  })
})

describe('readRecentRemoteDetallado distingue ausente de fallido', () => {
  const linea = JSON.stringify({
    t: T, symbol: 'NVDA', onchain: 1, reference: 1, gapPct: 0,
    liquidityUsd: 0, volume24h: 0, status: 'closed',
  })

  it('un 404 es un dia que no existe, no un fallo', async () => {
    const fetcher = async () => new Response('no', { status: 404 })
    expect(await readRecentRemoteDetallado(fetcher, 3, T)).toEqual({ samples: [], fallos: 0 })
  })

  it('un 500 SI es un fallo y queda contado', async () => {
    const fetcher = async () => new Response('boom', { status: 500 })
    const r = await readRecentRemoteDetallado(fetcher, 3, T)
    expect(r.fallos).toBe(3)
  })

  it('un 429 tambien, y el dato parcial viaja con su cuenta de fallos', async () => {
    let n = 0
    const fetcher = async () => {
      n++
      return n === 1
        ? new Response('rate limited', { status: 429 })
        : new Response(linea + '\n', { status: 200 })
    }
    const r = await readRecentRemoteDetallado(fetcher, 3, T)
    expect(r.fallos).toBe(1)
    // El dato parcial NO se pierde: quien lo consume decide que hacer con el.
    expect(r.samples).toHaveLength(2)
  })

  it('la red caida cuenta como fallo, no como ausencia', async () => {
    const fetcher = async () => {
      throw new Error('ENOTFOUND')
    }
    expect((await readRecentRemoteDetallado(fetcher, 2, T)).fallos).toBe(2)
  })

  it('readRecentRemote sigue devolviendo solo las muestras, sin romper a state.ts', async () => {
    const fetcher = async () => new Response(linea + '\n', { status: 200 })
    expect(await readRecentRemote(fetcher, 2, T)).toHaveLength(2)
  })
})
