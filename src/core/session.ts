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

/** La ventana sobre la que se mide el tramo ciego: un dia. */
export const VENTANA_CIEGA_SEC = 86400

/**
 * Que fraccion del ultimo dia estuvo SIN precio de referencia.
 *
 * Es la tesis del producto reducida a un numero entre 0 y 1, y el escritorio la
 * usa para rayar su propio fondo: el piso de la pagina dice cuanto del dia
 * estuvo a ciegas.
 *
 * Cuelga de `ultimoTrade`, que es el MISMO instante con el que el reloj de 24 h
 * pinta su banda rayada y con el que la fachada ancla sus ranuras. Se calcula
 * aca y no en el componente por la leccion que este proyecto ya pago: el reloj
 * contaba corridas y la fachada ranuras cumplidas, y divergian por uno.
 *
 * Cuenta SOLO tiempo TRANSCURRIDO, nunca el proyectado. El bug mas caro del
 * tercer juicio fue exactamente ese: `horasCerrado` sumaba `hoursUntilOpen` y la
 * pagina sobrestimaba en 62 % la magnitud que es su tesis entera. Un fondo que
 * rayara el futuro repetiria el error en grande.
 *
 * Con el mercado ABIERTO el ultimo trade es de hace un momento, asi que la
 * fraccion cae sola a ~0 y el escritorio queda limpio: hay precio de referencia,
 * no hay nada que rayar. Devuelve `null` cuando la fuente no dice nada, y ahi
 * tampoco se raya — no se afirma ceguera que no se midio.
 */
export function fraccionCiega(
  ultimoTradeSec: number | null,
  nowSec: number,
  ventanaSec = VENTANA_CIEGA_SEC,
): number | null {
  if (ultimoTradeSec === null || !Number.isFinite(ultimoTradeSec)) return null
  const transcurrido = nowSec - ultimoTradeSec
  if (!Number.isFinite(transcurrido)) return null
  return Math.max(0, Math.min(1, transcurrido / ventanaSec))
}
