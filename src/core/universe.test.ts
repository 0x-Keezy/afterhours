import { describe, expect, it } from 'vitest'
import type { DexPair } from './universe.js'
import { isStockToken, pickUsdgPair, watchlist } from './universe.js'

const par = (over: { symbol: string; quote: string; liq: number }): DexPair => ({
  chainId: 'robinhood',
  pairAddress: `0xpair-${over.symbol}-${over.quote}-${over.liq}`,
  baseToken: { address: '0xbase', name: `${over.symbol} • Robinhood Token`, symbol: over.symbol },
  quoteToken: { address: '0xquote', name: over.quote, symbol: over.quote },
  priceUsd: '100',
  liquidity: { usd: over.liq },
  volume: { h24: 1000 },
})

describe('isStockToken', () => {
  it('acepta el nombre canónico medido en la chain', () => {
    expect(isStockToken('NVIDIA • Robinhood Token')).toBe(true)
  })

  it('rechaza un memecoin que sólo menciona Robinhood', () => {
    expect(isStockToken('Robinhood Token Killer')).toBe(false)
    expect(isStockToken('HOODRAT')).toBe(false)
  })

  it('exige el separador exacto U+2022, no un guion', () => {
    expect(isStockToken('NVIDIA - Robinhood Token')).toBe(false)
  })
})

describe('pickUsdgPair', () => {
  it('elige el par USDG más líquido cuando hay varios', () => {
    const p = pickUsdgPair(
      [par({ symbol: 'NVDA', quote: 'USDG', liq: 100 }), par({ symbol: 'NVDA', quote: 'USDG', liq: 5270875 })],
      'NVDA',
    )
    expect(p?.liquidity?.usd).toBe(5270875)
  })

  it('ignora los pares que no son contra USDG', () => {
    expect(pickUsdgPair([par({ symbol: 'NVDA', quote: 'WETH', liq: 999999 })], 'NVDA')).toBeNull()
  })

  it('ignora pares de otra chain', () => {
    const ajeno = { ...par({ symbol: 'NVDA', quote: 'USDG', liq: 10 }), chainId: 'solana' }
    expect(pickUsdgPair([ajeno], 'NVDA')).toBeNull()
  })

  it('devuelve null para HOOD, que no tiene par USDG (caso real medido)', () => {
    expect(pickUsdgPair([], 'HOOD')).toBeNull()
  })
})

describe('watchlist', () => {
  it('deja fuera lo ilíquido y ordena por liquidez descendente', () => {
    const q = (symbol: string, liquidityUsd: number) => ({
      symbol, address: '0x', pairAddress: '0x', priceUsd: 1, liquidityUsd, volume24h: 0,
    })
    const out = watchlist([q('COIN', 56787), q('NVDA', 5270875), q('MICRO', 900)], 25000)
    expect(out.map((o) => o.symbol)).toEqual(['NVDA', 'COIN'])
  })
})
