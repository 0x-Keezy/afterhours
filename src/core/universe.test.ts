import { describe, expect, it } from 'vitest'
import type { DexPair } from './universe'
import { dedupeBySymbol, isStockToken, mergeUniverse, pickUsdgPair, watchlist } from './universe'

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

describe('mergeUniverse', () => {
  const t = (symbol: string) => ({ symbol, address: `0x${symbol.toLowerCase()}`, name: `${symbol} • Robinhood Token` })

  it('marca lo visto con la fecha de la corrida', () => {
    const out = mergeUniverse([], [t('NVDA')], 1788239520)
    expect(out).toEqual([{ ...t('NVDA'), firstSeen: 1788239520, lastSeen: 1788239520 }])
  })

  it('conserva firstSeen y actualiza lastSeen al reencontrarlo', () => {
    const previo = [{ ...t('NVDA'), firstSeen: 100, lastSeen: 100 }]
    const out = mergeUniverse(previo, [t('NVDA')], 1788239520)
    expect(out[0]).toMatchObject({ firstSeen: 100, lastSeen: 1788239520 })
  })

  it('NO borra lo que esta corrida no vio: un 429 no puede vaciar el universo', () => {
    const previo = [{ ...t('NVDA'), firstSeen: 100, lastSeen: 100 }]
    const out = mergeUniverse(previo, [t('AAPL')], 1788239520)
    expect(out.map((x) => x.symbol).sort()).toEqual(['AAPL', 'NVDA'])
    expect(out.find((x) => x.symbol === 'NVDA')!.lastSeen).toBe(100)
  })

  it('ordena por símbolo para que el diff en git sea legible', () => {
    const out = mergeUniverse([], [t('TSLA'), t('AAPL'), t('NVDA')], 1)
    expect(out.map((x) => x.symbol)).toEqual(['AAPL', 'NVDA', 'TSLA'])
  })
})

describe('dedupeBySymbol', () => {
  const q = (symbol: string, address: string, liquidityUsd: number) => ({
    symbol, address, pairAddress: `0xp${address}`, priceUsd: 220.31, liquidityUsd, volume24h: 0,
  })

  it('deja una sola fila por símbolo, la del par más líquido', () => {
    // Medido: NVDA tiene 4 contratos en la chain y los 4 resolvían al mismo par
    const out = dedupeBySymbol([q('NVDA', '0xa', 100), q('NVDA', '0xb', 5319279), q('NVDA', '0xc', 0)])
    expect(out).toHaveLength(1)
    expect(out[0]!.address).toBe('0xb')
  })

  it('no toca los símbolos que ya son únicos', () => {
    const out = dedupeBySymbol([q('NVDA', '0xa', 1), q('TSLA', '0xb', 2)])
    expect(out.map((o) => o.symbol).sort()).toEqual(['NVDA', 'TSLA'])
  })

  it('es estable con la lista vacía', () => {
    expect(dedupeBySymbol([])).toEqual([])
  })
})
