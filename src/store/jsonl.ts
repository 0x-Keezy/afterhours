import { appendFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Sample } from '../core/types'
import { median } from '../core/gap'

export type DailySummary = {
  day: string
  symbol: string
  n: number
  open: number
  close: number
  min: number
  max: number
  median: number
  liquidityUsd: number
}

const DAY = 86400

export function dayKey(tSec: number): string {
  return new Date(tSec * 1000).toISOString().slice(0, 10)
}

const rawDir = (dir: string) => join(dir, 'raw')
const rawFile = (dir: string, day: string) => join(rawDir(dir), `${day}.jsonl`)

export async function appendSamples(dir: string, samples: Sample[]): Promise<void> {
  if (samples.length === 0) return
  await mkdir(rawDir(dir), { recursive: true })
  const porDia = new Map<string, Sample[]>()
  for (const s of samples) {
    const k = dayKey(s.t)
    porDia.set(k, [...(porDia.get(k) ?? []), s])
  }
  for (const [day, filas] of porDia) {
    await appendFile(rawFile(dir, day), filas.map((f) => JSON.stringify(f)).join('\n') + '\n', 'utf8')
  }
}

/** Parseo puro del JSONL. Lo comparten el lector de disco y el remoto. */
export function parseJsonl(txt: string): Sample[] {
  const out: Sample[] = []
  for (const linea of txt.split('\n')) {
    if (!linea.trim()) continue
    try {
      out.push(JSON.parse(linea) as Sample)
    } catch {
      // una línea rota no puede costar el día entero
    }
  }
  return out
}

/** Lo mismo para el resumen diario. `compactDay` lo relee para reescribirlo. */
export function parseDaily(txt: string): DailySummary[] {
  const out: DailySummary[] = []
  for (const linea of txt.split('\n')) {
    if (!linea.trim()) continue
    try {
      out.push(JSON.parse(linea) as DailySummary)
    } catch {
      // una línea rota no puede costar el mes entero
    }
  }
  return out
}

export async function readDay(dir: string, day: string): Promise<Sample[]> {
  try {
    return parseJsonl(await readFile(rawFile(dir, day), 'utf8'))
  } catch {
    return []
  }
}

export async function readRecent(dir: string, days: number, nowSec: number): Promise<Sample[]> {
  const out: Sample[] = []
  for (let i = days - 1; i >= 0; i--) {
    out.push(...(await readDay(dir, dayKey(nowSec - i * DAY))))
  }
  return out
}

export function summarize(day: string, samples: Sample[]): DailySummary[] {
  const porSimbolo = new Map<string, Sample[]>()
  for (const s of samples) porSimbolo.set(s.symbol, [...(porSimbolo.get(s.symbol) ?? []), s])

  return [...porSimbolo.entries()].map(([symbol, filas]) => {
    const ord = [...filas].sort((a, b) => a.t - b.t)
    const gaps = ord.map((f) => f.gapPct)
    return {
      day,
      symbol,
      n: ord.length,
      open: gaps[0]!,
      close: gaps[gaps.length - 1]!,
      min: Math.min(...gaps),
      max: Math.max(...gaps),
      median: median(gaps),
      liquidityUsd: ord[ord.length - 1]!.liquidityUsd,
    }
  })
}

/**
 * Cierra un día en `daily/`, REEMPLAZANDO sus filas en vez de anexarlas.
 *
 * Antes usaba `appendFile`, y como el guard que lo llamaba nunca podía ser falso
 * (ver `poller/cli.ts`) el resumen entero se re-anexaba en CADA corrida. Medido
 * el 2026-09-03: `data/daily/2026-09.jsonl` tenía 3.508 líneas para 110 resúmenes
 * reales — 96,86 % duplicado byte-idéntico, NVDA del 1-sep repetido 54 veces.
 *
 * Y el daño no era cosmético. Ese archivo inflado **conflictuaba en cada rebase
 * de la CI**, y como `.gitattributes` no lo cubría con `merge=union`, el conflicto
 * era absorbente: una de cada dos corridas del poller moría con sus 23 lecturas
 * adentro. En un producto cuyo valor ES el archivo, eso es dato que no se puede
 * volver a tomar.
 *
 * Reescribir en vez de anexar da la propiedad que hacía falta: el resultado **no
 * depende de cuántas veces corrió**. Dos corridas seguidas escriben bytes
 * idénticos, así que git no ve un cambio y no hay nada que conflictúe. Como
 * efecto secundario se vuelve auto-reparable: si la corrida que cruzaba la
 * medianoche se perdió, la siguiente igual cierra el día.
 *
 * El orden de salida es determinista (día, después símbolo) por la misma razón:
 * un orden que depende del Map haría aparecer un diff donde no cambió nada.
 */
export async function compactDay(dir: string, day: string): Promise<DailySummary[]> {
  const resumen = summarize(day, await readDay(dir, day))
  if (resumen.length === 0) return []
  await mkdir(join(dir, 'daily'), { recursive: true })
  const mes = day.slice(0, 7)
  const ruta = join(dir, 'daily', `${mes}.jsonl`)

  let previas: DailySummary[] = []
  try {
    previas = parseDaily(await readFile(ruta, 'utf8'))
  } catch {
    // primer cierre del mes
  }

  const filas = [...previas.filter((f) => f.day !== day), ...resumen].sort(
    (a, b) => a.day.localeCompare(b.day) || a.symbol.localeCompare(b.symbol),
  )
  await writeFile(ruta, filas.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
  return resumen
}

export async function pruneRaw(dir: string, keepDays: number, nowSec: number): Promise<string[]> {
  let archivos: string[]
  try {
    archivos = await readdir(rawDir(dir))
  } catch {
    return []
  }
  const corte = dayKey(nowSec - (keepDays - 1) * DAY)
  const borrados: string[] = []
  for (const f of archivos) {
    if (!f.endsWith('.jsonl')) continue
    const day = f.slice(0, -6)
    if (day < corte) {
      await rm(join(rawDir(dir), f))
      borrados.push(day)
    }
  }
  return borrados.sort()
}
