import type { OnchainQuote, StockToken } from '../core/types.js'
import { DEX_CHAIN_ID, pickUsdgPair, type DexPair } from '../core/universe.js'
import { BROWSER_HEADERS, type Fetcher } from './http.js'

const BASE = 'https://api.dexscreener.com/tokens/v1'

async function pedir(fetcher: Fetcher, addresses: string[]): Promise<DexPair[]> {
  const res = await fetcher(`${BASE}/${DEX_CHAIN_ID}/${addresses.join(',')}`, { headers: BROWSER_HEADERS })
  if (!res.ok) return []
  const data = (await res.json()) as unknown
  return Array.isArray(data) ? (data as DexPair[]) : ((data as { pairs?: DexPair[] }).pairs ?? [])
}

function aCotizacion(pares: DexPair[], t: StockToken): OnchainQuote | null {
  const p = pickUsdgPair(pares, t.symbol)
  if (!p) return null
  const priceUsd = Number(p.priceUsd)
  if (!Number.isFinite(priceUsd)) return null
  return {
    symbol: t.symbol,
    address: t.address,
    pairAddress: p.pairAddress,
    priceUsd,
    liquidityUsd: p.liquidity?.usd ?? 0,
    volume24h: p.volume?.h24 ?? 0,
  }
}

/**
 * El lote no se confía: medido, devolvió 4 de 6 direcciones pedidas. Se verifica
 * la cobertura y se reintenta de a uno lo que falte.
 */
export async function quoteTokens(
  fetcher: Fetcher,
  tokens: StockToken[],
  batchSize = 5,
): Promise<OnchainQuote[]> {
  const out: OnchainQuote[] = []
  const faltantes: StockToken[] = []

  for (let i = 0; i < tokens.length; i += batchSize) {
    const lote = tokens.slice(i, i + batchSize)
    const pares = await pedir(fetcher, lote.map((t) => t.address))
    for (const t of lote) {
      const q = aCotizacion(pares, t)
      if (q) out.push(q)
      else faltantes.push(t)
    }
  }

  for (const t of faltantes) {
    const q = aCotizacion(await pedir(fetcher, [t.address]), t)
    if (q) out.push(q)
  }

  return out
}
