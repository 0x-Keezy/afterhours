import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { POLL_INTERVAL_SEC } from '../core/archive'
import { cortePorLectura } from './page'

describe('cortePorLectura', () => {
  it('sin archivo todavia no hay corte que dar', () => {
    expect(cortePorLectura(null)).toBe('0px')
  })

  it('ALTERNA con cada ranura de cadencia: cada fila nueva mueve el tejido', () => {
    const base = 10 * POLL_INTERVAL_SEC
    expect(cortePorLectura(base)).toBe('0px')
    expect(cortePorLectura(base + POLL_INTERVAL_SEC)).toBe('calc(var(--paso) / 2)')
    expect(cortePorLectura(base + 2 * POLL_INTERVAL_SEC)).toBe('0px')
  })

  it('dos lecturas de la MISMA ranura no producen un corte falso', () => {
    // Con corridas solapadas dos lecturas caen en la misma ranura de 15 min.
    // Si cada una moviera el tejido, el corte dejaria de significar "una fila
    // nueva" y pasaria a significar "algo paso", que no es lo mismo.
    const base = 10 * POLL_INTERVAL_SEC
    expect(cortePorLectura(base + 1)).toBe(cortePorLectura(base + POLL_INTERVAL_SEC - 1))
  })

  it('no acumula: el salto siempre vuelve, nunca deriva', () => {
    // Un desplazamiento acumulado seria indistinguible del respiro. Lo que
    // tiene que leerse es el EVENTO, no una posicion.
    const vistos = new Set(
      Array.from({ length: 40 }, (_, k) => cortePorLectura(k * POLL_INTERVAL_SEC)),
    )
    expect(vistos.size).toBe(2)
  })
})

/**
 * GATE del suelo.
 *
 * Existe por una falla concreta y cara: la version anterior ataba el ANCHO del
 * fondo a un dato, y con el mercado abierto ese dato valia 0 — asi que el
 * elemento medía 0 px y no habia nada animado justo en las horas en que alguien
 * mira la pagina. Jose lo reporto dos veces. Estas propiedades son las que hacen
 * que eso no pueda repetirse.
 */
describe('gate: el suelo no puede quedar en cero', () => {
  const css = readFileSync('src/app/theme.css', 'utf8')
  const page = readFileSync('src/app/page.tsx', 'utf8')

  const regla = (sel: string) => {
    const i = css.indexOf(sel + ' {')
    return i < 0 ? null : css.slice(i, css.indexOf('}', i))
  }

  it('el suelo cubre TODO, y su tamano no cuelga de ningun dato', () => {
    const suelo = regla('.suelo')
    expect(suelo).not.toBeNull()
    expect(suelo!).toContain('inset: 0')
    // La propiedad que importa: nada de ancho o alto variable.
    expect(suelo!).not.toMatch(/width:|height:/)
  })

  it('se ancla a la PANTALLA y no al escritorio', () => {
    // `.desk` tiene max-width 84rem. Anclado a el, el fondo dejaba 576 px
    // planos a 1920, 1216 a 2560 y 2096 en ultrawide — medido en produccion.
    // `fixed` es lo unico que lo hace cubrir cualquier monitor.
    expect(regla('.suelo')!).toContain('position: fixed')
  })

  it('el PASO del tejido es una constante, no una variable del dato', () => {
    // Si el paso pasara a colgar de un campo, un valor extremo podria dejarlo
    // invisible — que es la misma falla con otra cara. Un juez ya midio ese
    // riesgo en una propuesta: su dial estaba clavado en el extremo de la
    // escala (14 h medidas contra un techo de 12 h).
    expect(page).toMatch(/'--paso':\s*'\d+px'/)
  })

  it('el CORTE sale del archivo, que es lo unico que afirma', () => {
    expect(page).toContain('cortePorLectura(archive.lastSampleAt)')
  })

  it('se mueve en pasos, no interpolando', () => {
    const inner = regla('.suelo > i')
    expect(inner).not.toBeNull()
    expect(inner!).toMatch(/animation:\s*respiro\s+\S+\s+steps\(/)
  })

  it('el interior sobresale, o el corte dejaria ver su borde', () => {
    const inner = regla('.suelo > i')!
    expect(inner).toContain('calc(-2 * var(--paso))')
    expect(inner).toContain('calc(100% + 4 * var(--paso))')
  })

  it('respeta prefers-reduced-motion', () => {
    const i = css.indexOf('prefers-reduced-motion')
    expect(css.slice(i)).toMatch(/\.suelo > i \{\s*animation: none;/)
  })

  it('el damero de body NO vuelve a competir en la misma banda', () => {
    // Convivian dos tramas a 45 grados con casi el mismo periodo y el mismo
    // color, y se leian como una titilando. Medido por un juez.
    expect(css).not.toContain('background-size: 8px 8px')
  })

  it('el suelo no habla: el respiro es ambiente y esta declarado como tal', () => {
    expect(page).toContain('className="suelo" aria-hidden="true"')
  })
})
