export type StockToken = { symbol: string; name: string; address: string }

export type OnchainQuote = {
  symbol: string
  address: string
  pairAddress: string
  priceUsd: number
  liquidityUsd: number
  volume24h: number
}

/** Ventana de la sesión regular tal como la publica el proveedor de equities. */
export type SessionWindow = { start: number; end: number }

export type MarketMeta = {
  regularMarketTime: number
  exchangeTimezoneName: string
  regular: SessionWindow
}

export type EquityQuote = { symbol: string; price: number; meta: MarketMeta }

export type MarketStatus = 'open' | 'closed'

export type MarketState = {
  status: MarketStatus
  hoursSinceLastTrade: number
  /** null cuando el payload no permite saber cuándo abre la próxima sesión. */
  hoursUntilOpen: number | null
}

export type Sample = {
  t: number
  symbol: string
  onchain: number
  reference: number
  gapPct: number
  liquidityUsd: number
  volume24h: number
  status: MarketStatus
}
