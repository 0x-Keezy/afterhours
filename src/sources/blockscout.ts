import { isStockToken } from '../core/universe.js'
import type { StockToken } from '../core/types.js'
import { BROWSER_HEADERS, type Fetcher } from './http.js'

export const BLOCKSCOUT_URL = 'https://robinhoodchain.blockscout.com'

/** Los booleanos deben ir en minúscula y los null vacíos, o la página siguiente da 422. */
export function encodePageParams(p: Record<string, unknown>): string {
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(p)) {
    if (v === null || v === undefined) usp.append(k, '')
    else if (typeof v === 'boolean') usp.append(k, v ? 'true' : 'false')
    else usp.append(k, String(v))
  }
  return usp.toString()
}

type Page = { items?: unknown[]; next_page_params?: Record<string, unknown> | null }

export async function listStockTokens(fetcher: Fetcher, baseUrl = BLOCKSCOUT_URL): Promise<StockToken[]> {
  const out: StockToken[] = []
  let params: Record<string, unknown> | null = null
  // Tope de seguridad: la chain tenía >3.000 tokens ERC-20 al medir.
  for (let page = 0; page < 400; page++) {
    const qs = params ? `&${encodePageParams(params)}` : ''
    const res = await fetcher(`${baseUrl}/api/v2/tokens?type=ERC-20${qs}`, { headers: BROWSER_HEADERS })
    if (!res.ok) throw new Error(`blockscout ${res.status} en la página ${page + 1}`)
    const data = (await res.json()) as Page
    const items = data.items ?? []
    for (const raw of items) {
      const it = raw as { symbol?: string; name?: string; address?: string; address_hash?: string }
      const name = it.name ?? ''
      const address = it.address ?? it.address_hash
      if (it.symbol && address && isStockToken(name)) out.push({ symbol: it.symbol, name, address })
    }
    if (!data.next_page_params || items.length === 0) break
    params = data.next_page_params
  }
  return out
}
