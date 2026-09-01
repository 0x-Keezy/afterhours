import { isStockToken } from '../core/universe'
import type { StockToken } from '../core/types'
import { BROWSER_HEADERS, type Fetcher } from './http'

export const BLOCKSCOUT_URL = 'https://robinhoodchain.blockscout.com'

export type StopReason = 'end' | 'maxPages' | `http:${number}` | 'network'

export type DiscoveryResult = {
  tokens: StockToken[]
  /** false = la lista puede estar recortada. Nunca se presenta como completa si no lo es. */
  complete: boolean
  pages: number
  /** Por qué terminó. Un "incompleto" mudo no se puede diagnosticar. */
  stoppedBecause: StopReason
}

export type DiscoveryOptions = {
  baseUrl?: string
  /** Medido: la chain tenía 59.350 tokens ERC-20 en 1.187 páginas. */
  maxPages?: number
  maxRetries?: number
  sleep?: (ms: number) => Promise<void>
  /** Cada cuántas páginas avisar el avance. */
  checkpointEvery?: number
  /**
   * Se llama con lo acumulado hasta ese punto. Sirve para persistir parcial: una
   * corrida de 20 minutos que muere sin checkpoints no deja NADA.
   */
  onCheckpoint?: (info: { pages: number; tokens: StockToken[] }) => void | Promise<void>
}

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

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Enumera las acciones tokenizadas de la chain. Es un trabajo LENTO y con techo:
 * Blockscout responde 429 después de unos cientos de páginas. Por eso corre como
 * descubrimiento ocasional que deja `data/universe.json`, y NO dentro del poller.
 */
export async function listStockTokens(
  fetcher: Fetcher,
  opts: DiscoveryOptions = {},
): Promise<DiscoveryResult> {
  const baseUrl = opts.baseUrl ?? BLOCKSCOUT_URL
  const maxPages = opts.maxPages ?? 1500
  const maxRetries = opts.maxRetries ?? 5
  const sleep = opts.sleep ?? dormir
  const checkpointEvery = opts.checkpointEvery ?? 0

  const out: StockToken[] = []
  let params: Record<string, unknown> | null = null
  let pages = 0

  for (; pages < maxPages; ) {
    const qs = params ? `&${encodePageParams(params)}` : ''
    const url = `${baseUrl}/api/v2/tokens?type=ERC-20${qs}`

    let res: Response | null = null
    let ultimoStatus = 0
    for (let intento = 0; intento <= maxRetries; intento++) {
      const r = await fetcher(url, { headers: BROWSER_HEADERS })
      ultimoStatus = r.status
      if (r.status !== 429) {
        res = r
        break
      }
      // backoff exponencial: 1s, 2s, 4s, 8s, 16s
      await sleep(1000 * 2 ** intento)
    }

    if (!res) {
      // Agotó los reintentos del 429: decirlo, no disfrazarlo de error de red.
      const razon: StopReason = ultimoStatus ? `http:${ultimoStatus}` : 'network'
      return { tokens: out, complete: false, pages, stoppedBecause: razon }
    }
    if (!res.ok) {
      return { tokens: out, complete: false, pages, stoppedBecause: `http:${res.status}` }
    }

    const data = (await res.json()) as Page
    const items = data.items ?? []
    pages++

    for (const raw of items) {
      const it = raw as { symbol?: string; name?: string; address?: string; address_hash?: string }
      const name = it.name ?? ''
      const address = it.address ?? it.address_hash
      if (it.symbol && address && isStockToken(name)) out.push({ symbol: it.symbol, name, address })
    }

    if (checkpointEvery > 0 && pages % checkpointEvery === 0) {
      await opts.onCheckpoint?.({ pages, tokens: [...out] })
    }

    if (!data.next_page_params || items.length === 0) {
      return { tokens: out, complete: true, pages, stoppedBecause: 'end' }
    }
    params = data.next_page_params
  }

  return { tokens: out, complete: false, pages, stoppedBecause: 'maxPages' }
}
