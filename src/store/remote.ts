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

/**
 * Una lectura remota, con el MOTIVO cuando no vino.
 *
 * `ausente` es un 404: ese día simplemente no existe en el repo, y es normal —
 * la ventana pide 14 días y el archivo arrancó el 2026-09-01.
 * `fallo` es cualquier otra cosa (429, 5xx, sin red). La diferencia importa:
 * un consumidor que ofrece el archivo como descarga no puede tratar "no existe"
 * y "no pude leerlo" igual, o entrega un archivo truncado con cara de completo.
 */
type Traida = { ok: true; txt: string } | { ok: false; motivo: 'ausente' | 'fallo' }

async function traer(fetcher: Fetcher, path: string): Promise<Traida> {
  try {
    const res = await fetcher(rawUrl(path), {
      headers: { Accept: 'text/plain' },
      // @ts-expect-error `next` es una extensión de Next sobre RequestInit
      next: { revalidate: REVALIDATE },
    })
    if (res.status === 404) return { ok: false, motivo: 'ausente' }
    if (!res.ok) return { ok: false, motivo: 'fallo' }
    return { ok: true, txt: await res.text() }
  } catch {
    // Sin red, la página se dibuja con lo que tenga en vez de romperse.
    return { ok: false, motivo: 'fallo' }
  }
}

/**
 * Lo mismo que `readRecentRemote`, pero declarando cuántos días NO se pudieron
 * leer por un fallo (no por no existir).
 *
 * Existe porque `/archive` sirve esto como descarga: un cuerpo incompleto con
 * HTTP 200 y `filename="afterhours.jsonl"` es indistinguible de uno completo, y
 * ése es exactamente el defecto que la ruta acaba de dejar de tener por el otro
 * lado. La página puede dibujarse con lo que haya —lo declara en su panel de
 * huecos—; un archivo descargable no puede.
 */
export async function readRecentRemoteDetallado(
  fetcher: Fetcher,
  days: number,
  nowSec: number,
): Promise<{ samples: Sample[]; fallos: number }> {
  const out: Sample[] = []
  let fallos = 0
  for (let i = days - 1; i >= 0; i--) {
    const r = await traer(fetcher, `raw/${dayKey(nowSec - i * DIA)}.jsonl`)
    if (r.ok) out.push(...parseJsonl(r.txt))
    else if (r.motivo === 'fallo') fallos++
  }
  return { samples: out, fallos }
}

export async function readRecentRemote(
  fetcher: Fetcher,
  days: number,
  nowSec: number,
): Promise<Sample[]> {
  return (await readRecentRemoteDetallado(fetcher, days, nowSec)).samples
}

export async function readUniverseRemote(fetcher: Fetcher): Promise<UniverseFile | null> {
  const r = await traer(fetcher, 'universe.json')
  if (!r.ok) return null
  const txt = r.txt
  try {
    return JSON.parse(txt) as UniverseFile
  } catch {
    return null
  }
}
