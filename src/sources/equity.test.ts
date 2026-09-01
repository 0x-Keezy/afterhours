import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { yahooEquitySource } from './equity'

const fixture = JSON.parse(await readFile('tests/fixtures/yahoo-nvda.json', 'utf8'))
const ok = async () => new Response(JSON.stringify(fixture), { status: 200 })

describe('yahooEquitySource', () => {
  it('extrae precio y ventana de sesión del payload real', async () => {
    const q = await yahooEquitySource(ok).quote('NVDA')
    expect(q.price).toBe(220.78)
    expect(q.meta.regularMarketTime).toBe(1788206401)
    expect(q.meta.regular).toEqual({ start: 1788269400, end: 1788292800 })
    expect(q.meta.exchangeTimezoneName).toBe('America/New_York')
  })

  it('manda User-Agent de navegador', async () => {
    let headers: Record<string, string> = {}
    await yahooEquitySource(async (_u, init) => { headers = init?.headers ?? {}; return ok() }).quote('NVDA')
    expect(headers['User-Agent']).toMatch(/Mozilla/)
  })

  it('falla con un mensaje que nombra el ticker cuando la respuesta no sirve', async () => {
    const vacio = async () => new Response(JSON.stringify({ chart: { result: [] } }), { status: 200 })
    await expect(yahooEquitySource(vacio).quote('TSLA')).rejects.toThrow(/TSLA/)
  })

  it('falla si el HTTP no es 200 (el proveedor puede cortar sin aviso)', async () => {
    const err = async () => new Response('nope', { status: 429 })
    await expect(yahooEquitySource(err).quote('NVDA')).rejects.toThrow(/429/)
  })
})
