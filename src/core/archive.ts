import type { Sample } from './types'

export type ArchiveGap = {
  from: number
  to: number
  missedSamples: number
  /**
   * Cuantas LECTURAS se perdieron, estimadas con el tamano de la lista de
   * vigilancia EN EL INSTANTE DEL HUECO.
   *
   * Existe porque la pagina lo estaba calculando mal y decia una falsedad:
   * multiplicaba las corridas perdidas por `board.rows.length`, o sea por la
   * lista de HOY. Medido el 2026-09-03: el peor hueco perdio 21 corridas y sus
   * corridas vecinas traian 48 y 53 lecturas, o sea ~1.071 — y la pagina decia
   * **1.428**, sobrestimando un 33 %. El censo crece con los dias, asi que la
   * constante del presente siempre sobrestima el pasado.
   *
   * Es la MISMA clase de error que el bug mas caro del tercer juicio, que
   * sobrestimaba la tesis un 62 % por sumar el futuro: una cuenta historica
   * multiplicada por un numero del presente. Por eso la estimacion se calcula
   * aca, donde estan las corridas, y no en el componente que dibuja.
   */
  lostReadings: number
}

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

/**
 * Distancia a partir de la cual dos lecturas dejan de ser consecutivas.
 *
 * Se exporta porque el tablero necesita EL MISMO umbral: una racha de precio no
 * puede atravesar un hueco que este mismo modulo esta declarando como hueco.
 */
export const GAP_UMBRAL_SEC = POLL_INTERVAL_SEC * GAP_FACTOR

export function archiveStats(history: Sample[], intervalSec = POLL_INTERVAL_SEC): ArchiveStats {
  if (history.length === 0) {
    return { samples: 0, firstSampleAt: null, lastSampleAt: null, gaps: [] }
  }

  // Varios tickers comparten el mismo instante: para los huecos importan las
  // CORRIDAS, no las filas. Pero el TAMANO de cada corrida hace falta para
  // estimar cuantas lecturas se perdio un hueco, asi que se cuenta acá.
  const tamano = new Map<number, number>()
  for (const h of history) tamano.set(h.t, (tamano.get(h.t) ?? 0) + 1)
  const instantes = [...tamano.keys()].sort((a, b) => a - b)

  const gaps: ArchiveGap[] = []
  for (let i = 1; i < instantes.length; i++) {
    const from = instantes[i - 1]!
    const to = instantes[i]!
    const delta = to - from
    if (delta > intervalSec * GAP_FACTOR) {
      const missedSamples = Math.round(delta / intervalSec) - 1
      // El promedio de las dos corridas que ABRAZAN el hueco es lo mejor que el
      // archivo puede testificar sobre el tamano de la lista mientras el hueco
      // duraba. No se puede saber exacto: nadie midio adentro.
      const vecinas = Math.round(((tamano.get(from) ?? 0) + (tamano.get(to) ?? 0)) / 2)
      gaps.push({ from, to, missedSamples, lostReadings: missedSamples * vecinas })
    }
  }

  return {
    samples: history.length,
    firstSampleAt: instantes[0]!,
    lastSampleAt: instantes[instantes.length - 1]!,
    gaps,
  }
}
