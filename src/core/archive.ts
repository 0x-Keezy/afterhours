import type { Sample } from './types'

export type ArchiveGap = { from: number; to: number; missedSamples: number }

export type ArchiveStats = {
  samples: number
  firstSampleAt: number | null
  lastSampleAt: number | null
  /** Los huecos se muestran; nunca se interpolan para taparlos. */
  gaps: ArchiveGap[]
}

/** Cadencia nominal del poller. */
export const POLL_INTERVAL_SEC = 900

/**
 * El cron de GitHub Actions no dispara al segundo (declara precisión de minutos
 * y se retrasa bajo carga). Sólo se llama hueco a lo que no se explica por jitter.
 */
const GAP_FACTOR = 1.5

export function archiveStats(history: Sample[], intervalSec = POLL_INTERVAL_SEC): ArchiveStats {
  if (history.length === 0) {
    return { samples: 0, firstSampleAt: null, lastSampleAt: null, gaps: [] }
  }

  // Varios tickers comparten el mismo instante: para los huecos importan las
  // CORRIDAS, no las filas.
  const instantes = [...new Set(history.map((h) => h.t))].sort((a, b) => a - b)

  const gaps: ArchiveGap[] = []
  for (let i = 1; i < instantes.length; i++) {
    const from = instantes[i - 1]!
    const to = instantes[i]!
    const delta = to - from
    if (delta > intervalSec * GAP_FACTOR) {
      gaps.push({ from, to, missedSamples: Math.round(delta / intervalSec) - 1 })
    }
  }

  return {
    samples: history.length,
    firstSampleAt: instantes[0]!,
    lastSampleAt: instantes[instantes.length - 1]!,
    gaps,
  }
}
