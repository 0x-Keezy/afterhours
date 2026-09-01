import { describe, expect, it } from 'vitest'
import { encodePageParams, listStockTokens } from './blockscout.js'

describe('encodePageParams', () => {
  it('serializa el booleano en minúscula (con "False" la API devuelve 422)', () => {
    expect(encodePageParams({ is_name_null: false })).toBe('is_name_null=false')
  })

  it('manda el null como valor vacío, no como la cadena "null"', () => {
    expect(encodePageParams({ market_cap: null })).toBe('market_cap=')
  })

  it('escapa los espacios del nombre', () => {
    expect(encodePageParams({ name: 'Hey Anon' })).toBe('name=Hey+Anon')
  })
})

const pagina = (items: unknown[], next: unknown = null) =>
  new Response(JSON.stringify({ items, next_page_params: next }), { status: 200 })

const sinDormir = async () => {}

describe('listStockTokens', () => {
  it('se queda sólo con las acciones tokenizadas y descarta el resto', async () => {
    const fetcher = async () =>
      pagina([
        { symbol: 'NVDA', name: 'NVIDIA • Robinhood Token', address: '0xnvda' },
        { symbol: 'USDG', name: 'Global Dollar', address: '0xusdg' },
        { symbol: 'HOODRAT', name: 'HOODRAT', address: '0xrat' },
        // 246 de los 438 que mencionan "Robinhood" son de esta clase (medido)
        { symbol: 'BANK', name: 'Robinhood Bank', address: '0xbank' },
      ])
    const r = await listStockTokens(fetcher, { sleep: sinDormir })
    expect(r.tokens).toEqual([{ symbol: 'NVDA', name: 'NVIDIA • Robinhood Token', address: '0xnvda' }])
    expect(r.complete).toBe(true)
  })

  it('sigue la paginación hasta que no hay next_page_params', async () => {
    const paginas = [
      pagina([{ symbol: 'AAPL', name: 'Apple • Robinhood Token', address: '0xa' }], { name: 'x', is_name_null: false }),
      pagina([{ symbol: 'TSLA', name: 'Tesla • Robinhood Token', address: '0xt' }]),
    ]
    let i = 0
    const r = await listStockTokens(async () => paginas[i++]!, { sleep: sinDormir })
    expect(r.tokens.map((t) => t.symbol)).toEqual(['AAPL', 'TSLA'])
    expect(r.pages).toBe(2)
    expect(r.complete).toBe(true)
  })

  it('manda User-Agent de navegador (sin él la API devuelve 403)', async () => {
    let visto: Record<string, string> = {}
    await listStockTokens(async (_url, init) => {
      visto = init?.headers ?? {}
      return pagina([])
    }, { sleep: sinDormir })
    expect(visto['User-Agent']).toMatch(/Mozilla/)
    expect(visto['Accept']).toMatch(/application\/json/)
  })

  it('reintenta el 429 en vez de abandonar (la chain tiene ~59.000 tokens)', async () => {
    let intentos = 0
    const fetcher = async () => {
      intentos++
      if (intentos <= 2) return new Response('slow down', { status: 429 })
      return pagina([{ symbol: 'NVDA', name: 'NVIDIA • Robinhood Token', address: '0xnvda' }])
    }
    const r = await listStockTokens(fetcher, { sleep: sinDormir })
    expect(intentos).toBe(3)
    expect(r.tokens).toHaveLength(1)
    expect(r.complete).toBe(true)
  })

  it('devuelve lo conseguido marcado como INCOMPLETO cuando el 429 no cede', async () => {
    let n = 0
    const fetcher = async () => {
      n++
      if (n === 1) return pagina([{ symbol: 'NVDA', name: 'NVIDIA • Robinhood Token', address: '0xnvda' }], { p: 2 })
      return new Response('slow down', { status: 429 })
    }
    const r = await listStockTokens(fetcher, { sleep: sinDormir, maxRetries: 2 })
    expect(r.tokens.map((t) => t.symbol)).toEqual(['NVDA'])
    expect(r.complete).toBe(false)
  })

  it('corta en maxPages y lo declara incompleto, sin mentir', async () => {
    const fetcher = async () => pagina([{ symbol: 'A', name: 'A • Robinhood Token', address: '0xa' }], { p: 1 })
    const r = await listStockTokens(fetcher, { sleep: sinDormir, maxPages: 3 })
    expect(r.pages).toBe(3)
    expect(r.complete).toBe(false)
  })

  it('un error que no es 429 corta la corrida y la marca incompleta', async () => {
    const fetcher = async () => new Response('nope', { status: 500 })
    const r = await listStockTokens(fetcher, { sleep: sinDormir })
    expect(r.complete).toBe(false)
    expect(r.tokens).toEqual([])
  })
})
