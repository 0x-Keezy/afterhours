import { describe, expect, it } from 'vitest'
import type { MarketMeta } from './types'
import { fraccionCiega, marketState, paperPhase, VENTANA_CIEGA_SEC } from './session'

const META: MarketMeta = {
  regularMarketTime: 1788206401,
  exchangeTimezoneName: 'America/New_York',
  regular: { start: 1788269400, end: 1788292800 },
}

describe('marketState', () => {
  it('reproduce la medición real: cerrado, 9.2 h desde el último trade, 8.3 h para abrir', () => {
    const s = marketState(META, 1788239520)
    expect(s.status).toBe('closed')
    expect(s.hoursSinceLastTrade).toBeCloseTo(9.2, 1)
    expect(s.hoursUntilOpen).toBeCloseTo(8.3, 1)
  })

  it('está abierto dentro de la ventana regular', () => {
    const s = marketState(META, 1788280000)
    expect(s.status).toBe('open')
    expect(s.hoursUntilOpen).toBeNull()
  })

  it('después del cierre no inventa la próxima apertura', () => {
    const s = marketState(META, 1788292801)
    expect(s.status).toBe('closed')
    expect(s.hoursUntilOpen).toBeNull()
  })

  it('nunca reporta horas negativas desde el último trade', () => {
    expect(marketState(META, 1788206000).hoursSinceLastTrade).toBe(0)
  })
})

describe('paperPhase', () => {
  it('es de día con el mercado abierto', () => {
    expect(paperPhase({ status: 'open', hoursSinceLastTrade: 1, hoursUntilOpen: null })).toBe('day')
  })

  it('es atardecer en las primeras horas tras el cierre', () => {
    expect(paperPhase({ status: 'closed', hoursSinceLastTrade: 2, hoursUntilOpen: null })).toBe('dusk')
  })

  it('es noche cerrada cuando falta mucho para abrir', () => {
    expect(paperPhase({ status: 'closed', hoursSinceLastTrade: 9, hoursUntilOpen: 8 })).toBe('night')
  })

  it('es amanecer cuando la apertura está cerca', () => {
    expect(paperPhase({ status: 'closed', hoursSinceLastTrade: 15, hoursUntilOpen: 1.5 })).toBe('dawn')
  })
})


describe('fraccionCiega', () => {
  const H = 3600
  const T = 1788239520

  it('mide SOLO tiempo transcurrido: 12 h a ciegas es medio dia', () => {
    expect(fraccionCiega(T - 12 * H, T)).toBeCloseTo(0.5, 6)
  })

  it('nunca cuenta el FUTURO, que es el bug mas caro que tuvo esta pagina', () => {
    // El tercer juicio midio que `horasCerrado` sumaba `hoursUntilOpen` y la
    // pagina sobrestimaba en 62 % su propia tesis. Un ultimo trade en el futuro
    // (reloj corrido de la fuente) no puede rayar NADA.
    expect(fraccionCiega(T + 5 * H, T)).toBe(0)
    expect(fraccionCiega(T + 1, T)).toBe(0)
  })

  it('con el mercado abierto cae sola a ~0 y el escritorio queda limpio', () => {
    // Abierto = el ultimo trade es de hace un momento. No hay ceguera que rayar.
    expect(fraccionCiega(T - 30, T)).toBeLessThan(0.001)
  })

  it('se topa en 1: un fin de semana no raya tres escritorios', () => {
    expect(fraccionCiega(T - 60 * H, T)).toBe(1)
    expect(fraccionCiega(T - VENTANA_CIEGA_SEC, T)).toBe(1)
  })

  it('sin dato de la fuente devuelve null, y null no afirma ceguera', () => {
    expect(fraccionCiega(null, T)).toBeNull()
    expect(fraccionCiega(Number.NaN, T)).toBeNull()
    expect(fraccionCiega(Number.POSITIVE_INFINITY, T)).toBeNull()
  })

  it('la ventana es un dia, y es la misma que dibuja el reloj', () => {
    expect(VENTANA_CIEGA_SEC).toBe(86400)
  })

  it('crece monotona con la noche, que es lo que la hace legible', () => {
    const serie = [1, 4, 8, 14, 20].map((h) => fraccionCiega(T - h * H, T)!)
    for (let i = 1; i < serie.length; i++) expect(serie[i]!).toBeGreaterThan(serie[i - 1]!)
  })
})
