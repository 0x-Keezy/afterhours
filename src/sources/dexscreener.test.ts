import { describe, expect, it } from 'vitest'
import type { StockToken } from '../core/types.js'
import { quoteTokens } from './dexscreener.js'

const tok = (symbol: string, address: string): StockToken => ({
  symbol, address, name: `${symbol} • Robinhood Token`,
})

const par = (symbol: string, address: string, liq: number) => ({
  chainId: 'robinhood',
  pairAddress: `0xpair${symbol}`,
  baseToken: { address, name: `${symbol} • Robinhood Token`, symbol },
  quoteToken: { address: '0xusdg', name: 'Global Dollar', symbol: 'USDG' },
  priceUsd: '220.31',
  liquidity: { usd: liq },
  volume: { h24: 34261770 },
})

const ok = (pairs: unknown[]) => new Response(JSON.stringify(pairs), { status: 200 })

describe('quoteTokens', () => {
  it('convierte el par en cotización usando el par USDG más líquido', async () => {
    const out = await quoteTokens(async () => ok([par('NVDA', '0xnvda', 5270875)]), [tok('NVDA', '0xnvda')])
    expect(out).toEqual([{
      symbol: 'NVDA', address: '0xnvda', pairAddress: '0xpairNVDA',
      priceUsd: 220.31, liquidityUsd: 5270875, volume24h: 34261770,
    }])
  })

  it('reintenta individualmente lo que el lote omitió (pasó de verdad: 4 de 6)', async () => {
    const llamadas: string[] = []
    const fetcher = async (url: string) => {
      llamadas.push(url)
      if (url.includes(',')) return ok([par('AAPL', '0xaapl', 464222)]) // omite NVDA
      return ok([par('NVDA', '0xnvda', 5270875)])
    }
    const out = await quoteTokens(fetcher, [tok('AAPL', '0xaapl'), tok('NVDA', '0xnvda')])
    expect(out.map((o) => o.symbol).sort()).toEqual(['AAPL', 'NVDA'])
    expect(llamadas).toHaveLength(2)
  })

  it('omite sin romper el ticker que no tiene par USDG (caso real: HOOD)', async () => {
    const out = await quoteTokens(async () => ok([]), [tok('HOOD', '0xhood')])
    expect(out).toEqual([])
  })

  it('parte el pedido en lotes del tamaño indicado', async () => {
    const llamadas: string[] = []
    await quoteTokens(
      async (url) => { llamadas.push(url); return ok([]) },
      [tok('A', '0xa'), tok('B', '0xb'), tok('C', '0xc')],
      2,
    )
    expect(llamadas.filter((u) => u.includes(',')).length).toBe(1)
  })

  it('no rompe la corrida cuando la API devuelve error en un lote', async () => {
    const fetcher = async (url: string) =>
      url.includes(',') ? new Response('rate limited', { status: 429 }) : ok([par('NVDA', '0xnvda', 100)])
    const out = await quoteTokens(fetcher, [tok('NVDA', '0xnvda'), tok('AAPL', '0xaapl')])
    expect(out.map((o) => o.symbol)).toEqual(['NVDA'])
  })
})
