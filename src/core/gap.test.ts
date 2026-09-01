import { describe, expect, it } from 'vitest'
import { calibration, gapPct, mad, median, robustZ, MIN_SAMPLES } from './gap.js'

describe('gapPct', () => {
  it('reproduce la medición real de NVDA del 2026-09-01', () => {
    expect(gapPct(220.31, 220.78)).toBeCloseTo(-0.2129, 4)
  })

  it('es positivo cuando el on-chain cotiza por encima del real', () => {
    expect(gapPct(316.85 * 1.01, 316.85)).toBeCloseTo(1, 6)
  })

  it('rechaza una referencia no positiva en vez de devolver Infinity', () => {
    expect(() => gapPct(100, 0)).toThrow(/referencia/)
    expect(() => gapPct(100, -5)).toThrow(/referencia/)
  })
})

describe('median', () => {
  it('devuelve el del medio con longitud impar', () => {
    expect(median([3, 1, 2])).toBe(2)
  })

  it('promedia los dos del medio con longitud par', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5)
  })

  it('rechaza la serie vacía', () => {
    expect(() => median([])).toThrow(/vacía/)
  })
})

describe('mad', () => {
  it('ignora el outlier, que es justamente para lo que sirve', () => {
    expect(mad([1, 2, 3, 4, 100])).toBe(1)
  })
})

describe('robustZ', () => {
  const historia = (valor: (i: number) => number) =>
    Array.from({ length: MIN_SAMPLES }, (_, i) => valor(i))

  it('devuelve null si no hay muestras suficientes (no inventa un z)', () => {
    expect(robustZ(-0.9, [-0.3, -0.1, -0.2])).toBeNull()
  })

  it('devuelve null si la dispersión es cero', () => {
    expect(robustZ(-0.9, historia(() => -0.2))).toBeNull()
  })

  it('mide cuántas desviaciones robustas se aleja el valor', () => {
    // mediana -0.2, MAD 0.1  ->  (-0.9 + 0.2) / (1.4826 * 0.1)
    const h = historia((i) => (i % 2 === 0 ? -0.3 : -0.1))
    expect(robustZ(-0.9, h)).toBeCloseTo(-4.72, 2)
  })
})

describe('calibration', () => {
  it('no está lista antes del mínimo y reporta el avance', () => {
    expect(calibration(50)).toEqual({ ready: false, progress: 0.25 })
  })

  it('está lista al alcanzar el mínimo y el avance queda tope en 1', () => {
    expect(calibration(MIN_SAMPLES)).toEqual({ ready: true, progress: 1 })
    expect(calibration(MIN_SAMPLES * 3)).toEqual({ ready: true, progress: 1 })
  })
})
