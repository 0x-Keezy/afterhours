import { describe, expect, it } from 'vitest'
import { marcaDeCambio } from './cambio'
import { resumenFachada, type Ranura } from './street'
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

describe('resumenFachada', () => {
  const TOTAL = STREET_WINDOWS.length
  const R = (...v: Ranura[]) => v

  it('con el mercado abierto el edificio esta entero encendido', () => {
    const r = resumenFachada({ abierto: true, ranuras: [], desconocido: false })
    expect(r.encendidas).toBe(TOTAL)
    expect(r.perdidas).toBe(0)
  })

  it('cerrado, una ventana por corrida PROGRAMADA, encendida si ocurrio', () => {
    const r = resumenFachada({
      abierto: false,
      ranuras: R('ok', 'ok', 'perdida', 'ok'),
      desconocido: false,
    })
    expect(r.programadas).toBe(4)
    expect(r.encendidas).toBe(3)
    expect(r.perdidas).toBe(1)
  })

  it('la ranura EN CURSO no cuenta como perdida', () => {
    // El defecto que cazo el segundo juez: con la ranura en curso contada como
    // hueco, la lectura mas reciente nunca podia encender su ventana y el panel
    // decia 0 de 1 con una lectura de hace cuatro minutos al lado.
    const r = resumenFachada({
      abierto: false,
      ranuras: R('ok', 'pendiente'),
      desconocido: false,
    })
    expect(r.encendidas).toBe(1)
    expect(r.perdidas).toBe(0)
    expect(r.pendientes).toBe(1)
    expect(r.programadas).toBe(2)
  })

  it('recien sonada la campana no hay ninguna ranura todavia', () => {
    const r = resumenFachada({ abierto: false, ranuras: [], desconocido: false })
    expect(r.programadas).toBe(0)
    expect(r.encendidas).toBe(0)
  })

  it('el denominador es lo PROGRAMADO y no el total del dibujo', () => {
    // El defecto que cazo el primer juez: contar sobre las 159 ventanas del
    // asset hacia que una noche entera cumplida (68 corridas) se leyera 43 %.
    const noche = Array.from({ length: 68 }, () => 'ok' as Ranura)
    const r = resumenFachada({ abierto: false, ranuras: noche, desconocido: false })
    expect(r.programadas).toBe(68)
    expect(r.encendidas).toBe(68)
    expect(r.encendidas).toBe(r.programadas)
  })

  it('el dibujo nunca se desborda: runs solo testifica 24 h = 96 ranuras', () => {
    const finde = Array.from({ length: 96 }, (_, i) => (i % 2 === 0 ? 'ok' : 'perdida') as Ranura)
    const r = resumenFachada({ abierto: false, ranuras: finde, desconocido: false })
    expect(r.programadas).toBe(96)
    expect(r.programadas).toBeLessThanOrEqual(TOTAL)
    expect(r.encendidas).toBe(48)
    expect(r.perdidas).toBe(48)
  })

  it('sin estado de mercado NO se enciende nada: no se inventa una lectura', () => {
    expect(
      resumenFachada({ abierto: false, ranuras: R('ok', 'ok'), desconocido: true }).encendidas,
    ).toBe(0)
    expect(resumenFachada({ abierto: true, ranuras: [], desconocido: true }).encendidas).toBe(0)
  })

  it('la fachada tiene ventanas de sobra para lo maximo que runs puede probar', () => {
    expect(TOTAL).toBeGreaterThanOrEqual(96)
  })
})
