import type { EquityQuote } from '../core/types'
import { BROWSER_HEADERS, type Fetcher } from './http'

export interface EquitySource {
  quote(symbol: string): Promise<EquityQuote>
}

const BASE = 'https://query1.finance.yahoo.com/v8/finance/chart'

/**
 * Yahoo no es una API oficial y puede cortar. Toda la dependencia vive acá:
 * cambiar de proveedor es escribir otro EquitySource, sin tocar el resto.
 * No hay endpoint de lote: el v7 (`/quote?symbols=`) devuelve 401 sin crumb.
 */
export function yahooEquitySource(fetcher: Fetcher): EquitySource {
  return {
    async quote(symbol: string): Promise<EquityQuote> {
      const res = await fetcher(`${BASE}/${symbol}?range=1d&interval=1d`, { headers: BROWSER_HEADERS })
      if (!res.ok) throw new Error(`equity ${symbol}: HTTP ${res.status}`)
      const data = (await res.json()) as {
        chart?: { result?: Array<{ meta?: Record<string, unknown> }> }
      }
      const meta = data.chart?.result?.[0]?.meta
      const regular = (meta?.currentTradingPeriod as { regular?: { start: number; end: number } } | undefined)?.regular
      const price = meta?.regularMarketPrice
      if (!meta || typeof price !== 'number' || !regular) {
        throw new Error(`equity ${symbol}: respuesta sin precio o sin ventana de sesión`)
      }
      return {
        symbol,
        price,
        meta: {
          regularMarketTime: Number(meta.regularMarketTime),
          exchangeTimezoneName: String(meta.exchangeTimezoneName ?? 'America/New_York'),
          regular: { start: regular.start, end: regular.end },
        },
      }
    },
  }
}
