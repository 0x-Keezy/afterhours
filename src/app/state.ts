import { cache } from 'react'
import { archiveStats, type ArchiveStats } from '../core/archive'
import { buildBoard, type Board } from '../core/board'
import { marketState, paperPhase, type PaperPhase } from '../core/session'
import type { MarketState } from '../core/types'
import { yahooEquitySource } from '../sources/equity'
import { readRecent } from '../store/jsonl'
import { readRecentRemote, readUniverseRemote } from '../store/remote'
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
  /**
   * La ventana de la sesión regular, tal como la publica la fuente.
   *
   * El reloj de 24 h la necesita para pintar CUÁNDO abre Wall Street. Se expone
   * cruda en vez de derivar horarios a mano: si un feriado mueve la campana, el
   * dibujo lo refleja solo en vez de mentir con un 09:30 hardcodeado.
   */
  session: { start: number; end: number } | null
  board: Board
  archive: ArchiveStats
  universe: UniverseFile | null
  /**
   * Instantes de cada corrida del poller en las últimas 24 h, ordenados.
   * Es lo que permite DIBUJAR el archivo en vez de sólo afirmarlo: un hueco en
   * la tira es visible, y "no missed runs" deja de ser una promesa escrita.
   */
  runs: number[]
}

const DIA = 86400

/**
 * El estado de la página, resuelto UNA vez por request.
 *
 * `cache` es lo que permite que el layout (que necesita la fase para pintar el
 * papel en <html>) y la página (que necesita todo lo demás) compartan la misma
 * lectura sin pedirle dos veces el precio a Yahoo.
 */
export const getPageState = cache(async (): Promise<PageState> => {
  const now = Math.floor(Date.now() / 1000)

  // En el deploy NO se lee el disco: el `data/` empaquetado queda congelado en
  // la foto del momento de publicar, y el poller commitea cada 15 minutos. Se
  // midió: el sitio decía 34 lecturas con 69 ya en el repo. En produccion se
  // lee el archivo publicado; en local, el disco.
  const remoto = process.env.VERCEL === '1'
  const history = remoto
    ? await readRecentRemote(fetch, DIAS, now)
    : await readRecent(DATA_DIR, DIAS, now)
  const universe = remoto ? await readUniverseRemote(fetch) : await readUniverse(DATA_DIR)

  const ultimoT = history.reduce((max, s) => Math.max(max, s.t), 0)
  const latest = history.filter((s) => s.t === ultimoT)

  // EL RELOJ no depende del archivo: es verdad desde el primer día, aunque no
  // haya ninguna muestra todavía. Por eso el ancla cae en SPY si no hay nada.
  const ancla = latest.find((s) => s.symbol === 'SPY')?.symbol ?? latest[0]?.symbol ?? 'SPY'

  let market: MarketState | null = null
  let tz: string | null = null
  let session: { start: number; end: number } | null = null
  let phase: PaperPhase = 'night'
  try {
    const eq = await yahooEquitySource(fetch).quote(ancla)
    market = marketState(eq.meta, now)
    tz = eq.meta.exchangeTimezoneName
    session = { start: eq.meta.regular.start, end: eq.meta.regular.end }
    phase = paperPhase(market)
  } catch {
    market = null
  }

  return {
    now,
    phase,
    market,
    tz,
    session,
    board: buildBoard(history, latest, now),
    archive: archiveStats(history),
    universe,
    // Una corrida escribe una fila por ticker, así que los instantes se
    // deduplican: lo que se dibuja son corridas, no filas.
    runs: [...new Set(history.filter((s) => s.t >= now - DIA).map((s) => s.t))].sort((a, b) => a - b),
  }
})
