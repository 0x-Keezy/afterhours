import { describe, expect, it } from 'vitest'
import type { Sample } from '../core/types'
import { readRecentRemote, readUniverseRemote, rawUrl } from './remote'

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
