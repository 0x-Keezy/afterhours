import type { OnchainQuote, StockToken } from './types'

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

export type UniverseEntry = StockToken & { firstSeen: number; lastSeen: number }

/**
 * Une lo descubierto con lo que ya sabíamos. Nunca borra: una corrida que se
 * cortó por 429 no puede vaciar el universo. Ordenado por símbolo para que el
 * diff en git se lea.
 */
export function mergeUniverse(
  previous: UniverseEntry[],
  found: StockToken[],
  nowSec: number,
): UniverseEntry[] {
  const porDireccion = new Map<string, UniverseEntry>()
  for (const p of previous) porDireccion.set(p.address.toLowerCase(), p)

  for (const f of found) {
    const clave = f.address.toLowerCase()
    const previo = porDireccion.get(clave)
    porDireccion.set(clave, {
      ...f,
      firstSeen: previo?.firstSeen ?? nowSec,
      lastSeen: nowSec,
    })
  }

  return [...porDireccion.values()].sort((a, b) => a.symbol.localeCompare(b.symbol))
}

/**
 * Una fila por símbolo, la del par más líquido.
 *
 * Medido en la chain: NVDA tiene 4 contratos, y GME/SPCX/TSLA/USAR tienen 2. Como
 * `pickUsdgPair` matchea por símbolo, todos resuelven al MISMO par y el poller
 * escribía 4 filas idénticas de NVDA. Eso no sólo infla el conteo: `calibration`
 * cuenta muestras, así que el ticker llegaría a "listo" 4 veces más rápido y
 * publicaría un z-score sin tener historia independiente detrás.
 */
export function dedupeBySymbol(quotes: OnchainQuote[]): OnchainQuote[] {
  const mejor = new Map<string, OnchainQuote>()
  for (const q of quotes) {
    const previo = mejor.get(q.symbol)
    if (!previo || q.liquidityUsd > previo.liquidityUsd) mejor.set(q.symbol, q)
  }
  return [...mejor.values()]
}
