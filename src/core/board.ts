import { calibration, robustZ } from './gap'
import type { Sample } from './types'

/** Un punto de la serie de un ticker: instante y gap. */
export type SeriePunto = { t: number; g: number }

export type BoardRow = {
  symbol: string
  gapPct: number
  z: number | null
  calibrating: boolean
  progress: number
  liquidityUsd: number
  /**
   * La historia del gap de ESTE ticker, en orden cronológico.
   *
   * La página afirma que "el valor es el archivo, no la lectura" y hasta ahora
   * no mostraba ni una serie: sólo el número derivado. Con esto cada fila puede
   * dibujar su propia forma en el tiempo, que es la afirmación hecha visible.
   *
   * Lleva el instante y no sólo el valor: las corridas pueden faltar, y dibujar
   * por índice cuando hay huecos es mentir sobre cuándo pasó cada cosa.
   */
  serie: SeriePunto[]
}

/**
 * Con qué criterio quedó ordenado el tablero. Mientras TODO calibra no hay z, y
 * decir "ordenado por anomalía" sería una afirmación que el dato no sostiene.
 */
export type BoardOrder = 'anomaly' | 'liquidity'

export type Board = { rows: BoardRow[]; samples: number; orderedBy: BoardOrder }

export function buildBoard(history: Sample[], latest: Sample[], _nowSec: number): Board {
  // Ordenado por instante: `history` no garantiza orden cronológico, y una serie
  // desordenada dibuja una forma que no ocurrió.
  const porSimbolo = new Map<string, SeriePunto[]>()
  for (const h of [...history].sort((a, b) => a.t - b.t)) {
    porSimbolo.set(h.symbol, [...(porSimbolo.get(h.symbol) ?? []), { t: h.t, g: h.gapPct }])
  }

  const rows: BoardRow[] = latest.map((l) => {
    const serie = porSimbolo.get(l.symbol) ?? []
    const valores = serie.map((p) => p.g)
    const { ready, progress } = calibration(valores.length)
    return {
      symbol: l.symbol,
      gapPct: l.gapPct,
      z: robustZ(l.gapPct, valores),
      calibrating: !ready,
      progress,
      liquidityUsd: l.liquidityUsd,
      serie,
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
