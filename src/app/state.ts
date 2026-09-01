import { cache } from 'react'
import { archiveStats, type ArchiveStats } from '../core/archive'
import { buildBoard, type Board } from '../core/board'
import { marketState, paperPhase, type PaperPhase } from '../core/session'
import type { MarketState } from '../core/types'
import { yahooEquitySource } from '../sources/equity'
import { readRecent } from '../store/jsonl'
import { readUniverse, type UniverseFile } from '../store/universe'

const DATA_DIR = 'data'
const DIAS = 14

export type PageState = {
  now: number
  phase: PaperPhase
  /** null cuando la fuente no responde: se declara desconocido en vez de inventarlo. */
  market: MarketState | null
  /** Zona del exchange, tal como la publica la fuente. No se deriva de nuevo. */
  tz: string | null
  board: Board
  archive: ArchiveStats
  universe: UniverseFile | null
}

/**
 * El estado de la página, resuelto UNA vez por request.
 *
 * `cache` es lo que permite que el layout (que necesita la fase para pintar el
 * papel en <html>) y la página (que necesita todo lo demás) compartan la misma
 * lectura sin pedirle dos veces el precio a Yahoo.
 */
export const getPageState = cache(async (): Promise<PageState> => {
  const now = Math.floor(Date.now() / 1000)
  const history = await readRecent(DATA_DIR, DIAS, now)
  const universe = await readUniverse(DATA_DIR)

  const ultimoT = history.reduce((max, s) => Math.max(max, s.t), 0)
  const latest = history.filter((s) => s.t === ultimoT)

  // EL RELOJ no depende del archivo: es verdad desde el primer día, aunque no
  // haya ninguna muestra todavía. Por eso el ancla cae en SPY si no hay nada.
  const ancla = latest.find((s) => s.symbol === 'SPY')?.symbol ?? latest[0]?.symbol ?? 'SPY'

  let market: MarketState | null = null
  let tz: string | null = null
  let phase: PaperPhase = 'night'
  try {
    const eq = await yahooEquitySource(fetch).quote(ancla)
    market = marketState(eq.meta, now)
    tz = eq.meta.exchangeTimezoneName
    phase = paperPhase(market)
  } catch {
    market = null
  }

  return {
    now,
    phase,
    market,
    tz,
    board: buildBoard(history, latest, now),
    archive: archiveStats(history),
    universe,
  }
})
