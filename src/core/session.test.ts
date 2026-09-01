import { describe, expect, it } from 'vitest'
import type { MarketMeta } from './types.js'
import { marketState, paperPhase } from './session.js'

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
