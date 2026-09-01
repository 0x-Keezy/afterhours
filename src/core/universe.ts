import type { OnchainQuote } from './types.js'

/** Separador U+2022. Medido en la chain: `NVIDIA • Robinhood Token`. */
export const STOCK_NAME_SUFFIX = ' • Robinhood Token'

export const DEX_CHAIN_ID = 'robinhood'
export const USDG_SYMBOL = 'USDG'

export type DexPair = {
  chainId: string
  pairAddress: string
  baseToken: { address: string; name: string; symbol: string }
  quoteToken: { address: string; name: string; symbol: string }
  priceUsd: string
  liquidity?: { usd?: number }
  volume?: { h24?: number }
}

export function isStockToken(name: string): boolean {
  return name.endsWith(STOCK_NAME_SUFFIX)
}

export function pickUsdgPair(pairs: DexPair[], symbol: string): DexPair | null {
  const candidatos = pairs.filter(
    (p) =>
      p.chainId === DEX_CHAIN_ID &&
      p.baseToken.symbol.toUpperCase() === symbol.toUpperCase() &&
      p.quoteToken.symbol.toUpperCase() === USDG_SYMBOL,
  )
  if (candidatos.length === 0) return null
  return candidatos.reduce((mejor, p) =>
    (p.liquidity?.usd ?? 0) > (mejor.liquidity?.usd ?? 0) ? p : mejor,
  )
}

export function watchlist(quotes: OnchainQuote[], minLiquidityUsd: number): OnchainQuote[] {
  return quotes
    .filter((q) => q.liquidityUsd >= minLiquidityUsd)
    .sort((a, b) => b.liquidityUsd - a.liquidityUsd)
}
