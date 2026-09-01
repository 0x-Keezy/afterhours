import { describe, expect, it } from 'vitest'
import type { EquityQuote, OnchainQuote, StockToken } from '../core/types.js'
import { pollOnce, type PollDeps } from './run.js'

const T = 1788239520
const meta = {
  regularMarketTime: 1788206401,
  exchangeTimezoneName: 'America/New_York',
  regular: { start: 1788269400, end: 1788292800 },
}
const tok = (symbol: string): StockToken => ({ symbol, address: `0x${symbol}`, name: `${symbol} • Robinhood Token` })
const onchain = (symbol: string, priceUsd: number, liquidityUsd: number): OnchainQuote => ({
  symbol, address: `0x${symbol}`, pairAddress: `0xp${symbol}`, priceUsd, liquidityUsd, volume24h: 1,
})

const deps = (over: Partial<PollDeps> = {}): PollDeps => ({
  loadUniverse: async () => [tok('NVDA'), tok('COIN'), tok('MICRO'), tok('HOOD')],
  quoteTokens: async () => [onchain('NVDA', 220.31, 5270875), onchain('COIN', 186.49, 56787), onchain('MICRO', 1, 900)],
  equity: {
    quote: async (symbol: string): Promise<EquityQuote> => ({
      symbol, price: symbol === 'NVDA' ? 220.78 : 188.12, meta,
    }),
  },
  now: () => T,
  minLiquidityUsd: 25000,
  ...over,
})

describe('pollOnce', () => {
  it('produce una muestra por ticker líquido, con el gap real', async () => {
    const r = await pollOnce(deps())
    expect(r.samples.map((s) => s.symbol).sort()).toEqual(['COIN', 'NVDA'])
    const nvda = r.samples.find((s) => s.symbol === 'NVDA')!
    expect(nvda.gapPct).toBeCloseTo(-0.2129, 4)
    expect(nvda.status).toBe('closed')
    expect(nvda.t).toBe(T)
  })

  it('informa qué dejó afuera y por qué, en vez de callarlo', async () => {
    const r = await pollOnce(deps())
    expect(r.skippedNoPair).toEqual(['HOOD'])
    expect(r.skippedIlliquid).toEqual(['MICRO'])
  })

  it('un ticker que falla en equity no mata la corrida', async () => {
    const r = await pollOnce(deps({
      equity: {
        quote: async (symbol: string) => {
          if (symbol === 'COIN') throw new Error('429')
          return { symbol, price: 220.78, meta }
        },
      },
    }))
    expect(r.samples.map((s) => s.symbol)).toEqual(['NVDA'])
    expect(r.failedEquity).toEqual(['COIN'])
  })

  it('marca el estado abierto cuando la sesión está en curso', async () => {
    const r = await pollOnce(deps({ now: () => 1788280000 }))
    expect(r.samples.every((s) => s.status === 'open')).toBe(true)
  })
})
