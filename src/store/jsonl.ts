import { appendFile, mkdir, readdir, readFile, rm } from 'node:fs/promises'
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

export async function compactDay(dir: string, day: string): Promise<DailySummary[]> {
  const resumen = summarize(day, await readDay(dir, day))
  if (resumen.length === 0) return []
  await mkdir(join(dir, 'daily'), { recursive: true })
  const mes = day.slice(0, 7)
  await appendFile(
    join(dir, 'daily', `${mes}.jsonl`),
    resumen.map((r) => JSON.stringify(r)).join('\n') + '\n',
    'utf8',
  )
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
