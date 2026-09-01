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

describe('listStockTokens', () => {
  it('se queda sólo con las acciones tokenizadas y descarta el resto', async () => {
    const fetcher = async () =>
      pagina([
        { symbol: 'NVDA', name: 'NVIDIA • Robinhood Token', address: '0xnvda' },
        { symbol: 'USDG', name: 'Global Dollar', address: '0xusdg' },
        { symbol: 'HOODRAT', name: 'HOODRAT', address: '0xrat' },
      ])
    const out = await listStockTokens(fetcher)
    expect(out).toEqual([{ symbol: 'NVDA', name: 'NVIDIA • Robinhood Token', address: '0xnvda' }])
  })

  it('sigue la paginación hasta que no hay next_page_params', async () => {
    const paginas = [
      pagina([{ symbol: 'AAPL', name: 'Apple • Robinhood Token', address: '0xa' }], { name: 'x', is_name_null: false }),
      pagina([{ symbol: 'TSLA', name: 'Tesla • Robinhood Token', address: '0xt' }]),
    ]
    let i = 0
    const out = await listStockTokens(async () => paginas[i++]!)
    expect(out.map((t) => t.symbol)).toEqual(['AAPL', 'TSLA'])
    expect(i).toBe(2)
  })

  it('manda User-Agent de navegador (sin él la API devuelve 403)', async () => {
    let visto: Record<string, string> = {}
    await listStockTokens(async (_url, init) => {
      visto = init?.headers ?? {}
      return pagina([])
    })
    expect(visto['User-Agent']).toMatch(/Mozilla/)
    expect(visto['Accept']).toMatch(/application\/json/)
  })

  it('avisa con el número de página cuando la API rechaza el pedido', async () => {
    const fetcher = async () => new Response('nope', { status: 422 })
    await expect(listStockTokens(fetcher)).rejects.toThrow(/422/)
  })
})
