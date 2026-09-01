import type { Sample } from '../core/types'
import type { Fetcher } from '../sources/http'
import { dayKey, parseJsonl } from './jsonl'
import type { UniverseFile } from './universe'

/**
 * Lectura del archivo desde GitHub, para el sitio desplegado.
 *
 * El poller commitea una muestra nueva cada 15 minutos. Si la página leyera el
 * `data/` empaquetado en el deploy, quedaría congelada en la foto del momento
 * en que se publicó: se midió, decía 34 lecturas cuando el repo ya tenía 69.
 * Un instrumento que se congela no es un instrumento.
 */
export const REPO = '0x-Keezy/afterhours'
const BRANCH = 'main'

export function rawUrl(path: string): string {
  return `https://raw.githubusercontent.com/${REPO}/${BRANCH}/data/${path}`
}

const DIA = 86400
/** El CDN de raw.githubusercontent cachea unos minutos; el dato cambia cada 15. */
const REVALIDATE = 60

async function traer(fetcher: Fetcher, path: string): Promise<string | null> {
  try {
    const res = await fetcher(rawUrl(path), {
      headers: { Accept: 'text/plain' },
      // @ts-expect-error `next` es una extensión de Next sobre RequestInit
      next: { revalidate: REVALIDATE },
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    // Sin red, la página se dibuja con lo que tenga en vez de romperse.
    return null
  }
}

export async function readRecentRemote(
  fetcher: Fetcher,
  days: number,
  nowSec: number,
): Promise<Sample[]> {
  const out: Sample[] = []
  for (let i = days - 1; i >= 0; i--) {
    const txt = await traer(fetcher, `raw/${dayKey(nowSec - i * DIA)}.jsonl`)
    if (txt) out.push(...parseJsonl(txt))
  }
  return out
}

export async function readUniverseRemote(fetcher: Fetcher): Promise<UniverseFile | null> {
  const txt = await traer(fetcher, 'universe.json')
  if (!txt) return null
  try {
    return JSON.parse(txt) as UniverseFile
  } catch {
    return null
  }
}
