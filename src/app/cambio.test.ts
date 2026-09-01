import { describe, expect, it } from 'vitest'
import { marcaDeCambio } from './cambio'
import { ventanasEncendidas } from './street'
import { STREET_WINDOWS } from './street-windows'

describe('marcaDeCambio', () => {
  const l = (texto: string, valor: number) => ({ texto, valor })

  it('no marca en la primera lectura: no hay contra que comparar', () => {
    expect(marcaDeCambio(undefined, l('0.42 %', 0.42))).toBe(null)
  })

  it('no marca cuando el valor llego igual', () => {
    expect(marcaDeCambio(l('0.42 %', 0.42), l('0.42 %', 0.42))).toBe(null)
  })

  it('marca la direccion en la que se movio', () => {
    expect(marcaDeCambio(l('0.42 %', 0.42), l('0.51 %', 0.51))).toBe('up')
    expect(marcaDeCambio(l('0.42 %', 0.42), l('0.31 %', 0.31))).toBe('down')
  })

  it('NO marca si el float se movio pero en pantalla dice lo mismo', () => {
    // Medido sobre el payload real: el gap viaja como 0.04106401423552649 y la
    // celda dice 0.04 %. Marcar aca seria afirmar un cambio ilegible.
    expect(marcaDeCambio(l('0.04 %', 0.04106401423552649), l('0.04 %', 0.044999))).toBe(null)
  })

  it('marca cuando el redondeo SI cruza, aunque el salto sea diminuto', () => {
    expect(marcaDeCambio(l('0.04 %', 0.04499), l('0.05 %', 0.04501))).toBe('up')
  })

  it('un cambio de signo cuenta por el valor, no por la magnitud', () => {
    expect(marcaDeCambio(l('-3.20 %', -3.2), l('-0.10 %', -0.1))).toBe('up')
    expect(marcaDeCambio(l('0.10 %', 0.1), l('-0.20 %', -0.2))).toBe('down')
  })

  it('el cero no es un caso especial', () => {
    expect(marcaDeCambio(l('0.00 %', 0), l('0.00 %', 0))).toBe(null)
    expect(marcaDeCambio(l('0.00 %', 0), l('0.01 %', 0.01))).toBe('up')
  })
})

describe('ventanasEncendidas', () => {
  const TOTAL = STREET_WINDOWS.length

  it('con el mercado abierto el edificio esta entero encendido', () => {
    expect(ventanasEncendidas({ abierto: true, lecturas: 0, desconocido: false })).toBe(TOTAL)
  })

  it('cerrado, una ventana por lectura del tramo', () => {
    expect(ventanasEncendidas({ abierto: false, lecturas: 0, desconocido: false })).toBe(0)
    expect(ventanasEncendidas({ abierto: false, lecturas: 1, desconocido: false })).toBe(1)
    expect(ventanasEncendidas({ abierto: false, lecturas: 68, desconocido: false })).toBe(68)
  })

  it('un fin de semana largo no desborda la fachada', () => {
    expect(ventanasEncendidas({ abierto: false, lecturas: 260, desconocido: false })).toBe(TOTAL)
  })

  it('sin estado de mercado NO se enciende nada: no se inventa una lectura', () => {
    expect(ventanasEncendidas({ abierto: false, lecturas: 40, desconocido: true })).toBe(0)
    expect(ventanasEncendidas({ abierto: true, lecturas: 40, desconocido: true })).toBe(0)
  })

  it('la fachada tiene ventanas suficientes para una noche entera de lecturas', () => {
    // 17 h de mercado cerrado a una lectura cada 15 min = 68.
    expect(TOTAL).toBeGreaterThanOrEqual(68)
  })
})
