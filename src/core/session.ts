import type { MarketMeta, MarketState } from './types'

export type PaperPhase = 'day' | 'dusk' | 'night' | 'dawn'

const HOUR = 3600
/** Horas tras el cierre que todavía se leen como "recién cerró". */
const DUSK_HOURS = 3
/** Horas antes de la apertura en que el papel empieza a aclarar. */
const DAWN_HOURS = 2

export function marketState(meta: MarketMeta, nowSec: number): MarketState {
  const open = nowSec >= meta.regular.start && nowSec <= meta.regular.end
  const hoursSinceLastTrade = Math.max(0, (nowSec - meta.regularMarketTime) / HOUR)
  const hoursUntilOpen = nowSec < meta.regular.start ? (meta.regular.start - nowSec) / HOUR : null
  return { status: open ? 'open' : 'closed', hoursSinceLastTrade, hoursUntilOpen }
}

/**
 * Fase del papel. Es un CORTE: cada estado tiene su par papel/tinta fijo y se
 * salta de uno al otro. Interpolar papel y tinta en direcciones opuestas los
 * cruza y en el cruce el contraste llega a cero.
 */
export function paperPhase(state: MarketState): PaperPhase {
  if (state.status === 'open') return 'day'
  if (state.hoursUntilOpen !== null && state.hoursUntilOpen <= DAWN_HOURS) return 'dawn'
  if (state.hoursSinceLastTrade <= DUSK_HOURS) return 'dusk'
  return 'night'
}
