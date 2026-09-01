import { calibration, robustZ } from './gap'
import type { Sample } from './types'

export type BoardRow = {
  symbol: string
  gapPct: number
  z: number | null
  calibrating: boolean
  progress: number
  liquidityUsd: number
}

/**
 * Con qué criterio quedó ordenado el tablero. Mientras TODO calibra no hay z, y
 * decir "ordenado por anomalía" sería una afirmación que el dato no sostiene.
 */
export type BoardOrder = 'anomaly' | 'liquidity'

export type Board = { rows: BoardRow[]; samples: number; orderedBy: BoardOrder }

export function buildBoard(history: Sample[], latest: Sample[], _nowSec: number): Board {
  const porSimbolo = new Map<string, number[]>()
  for (const h of history) porSimbolo.set(h.symbol, [...(porSimbolo.get(h.symbol) ?? []), h.gapPct])

  const rows: BoardRow[] = latest.map((l) => {
    const serie = porSimbolo.get(l.symbol) ?? []
    const { ready, progress } = calibration(serie.length)
    return {
      symbol: l.symbol,
      gapPct: l.gapPct,
      z: robustZ(l.gapPct, serie),
      calibrating: !ready,
      progress,
      liquidityUsd: l.liquidityUsd,
    }
  })

  // Primero lo anómalo; lo que todavía calibra va al final, nunca mezclado. Entre
  // los que calibran no hay anomalía que comparar, así que se ordenan por liquidez
  // (determinista) en vez de quedar al azar del orden de llegada.
  rows.sort((a, b) => {
    if (a.calibrating !== b.calibrating) return a.calibrating ? 1 : -1
    if (a.calibrating) return b.liquidityUsd - a.liquidityUsd
    return Math.abs(b.z ?? 0) - Math.abs(a.z ?? 0)
  })

  const orderedBy: BoardOrder = rows.some((r) => !r.calibrating) ? 'anomaly' : 'liquidity'

  return { rows, samples: history.length, orderedBy }
}
