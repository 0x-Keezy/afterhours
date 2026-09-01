import { gapPct } from '../core/gap'
import { marketState } from '../core/session'
import type { EquityQuote, OnchainQuote, Sample, StockToken } from '../core/types'
import { dedupeBySymbol, watchlist } from '../core/universe'

export type PollDeps = {
  loadUniverse: () => Promise<StockToken[]>
  quoteTokens: (tokens: StockToken[]) => Promise<OnchainQuote[]>
  equity: { quote: (symbol: string) => Promise<EquityQuote> }
  now: () => number
  minLiquidityUsd: number
}

export type PollResult = {
  samples: Sample[]
  skippedNoPair: string[]
  skippedIlliquid: string[]
  failedEquity: string[]
}

export async function pollOnce(deps: PollDeps): Promise<PollResult> {
  const t = deps.now()
  const tokens = await deps.loadUniverse()
  // Un símbolo puede tener varios contratos en la chain (NVDA tiene 4). Sin esto
  // se archivan filas duplicadas y la calibración del z-score se acelera falso.
  const quotes = dedupeBySymbol(await deps.quoteTokens(tokens))

  const conPar = new Set(quotes.map((q) => q.symbol))
  const skippedNoPair = tokens.map((x) => x.symbol).filter((s) => !conPar.has(s))

  const liquidos = watchlist(quotes, deps.minLiquidityUsd)
  const enLista = new Set(liquidos.map((q) => q.symbol))
  const skippedIlliquid = quotes.map((q) => q.symbol).filter((s) => !enLista.has(s))

  const samples: Sample[] = []
  const failedEquity: string[] = []

  for (const q of liquidos) {
    try {
      const eq = await deps.equity.quote(q.symbol)
      samples.push({
        t,
        symbol: q.symbol,
        onchain: q.priceUsd,
        reference: eq.price,
        gapPct: gapPct(q.priceUsd, eq.price),
        liquidityUsd: q.liquidityUsd,
        volume24h: q.volume24h,
        status: marketState(eq.meta, t).status,
      })
    } catch {
      failedEquity.push(q.symbol)
    }
  }

  return { samples, skippedNoPair, skippedIlliquid, failedEquity }
}
