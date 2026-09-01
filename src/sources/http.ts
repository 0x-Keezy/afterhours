export type Fetcher = (url: string, init?: { headers: Record<string, string> }) => Promise<Response>

/**
 * Sin estas cabeceras, Blockscout y el /search de DexScreener devuelven 403.
 * Medido el 2026-09-01; no es defensivo, es requisito.
 */
export const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
}
