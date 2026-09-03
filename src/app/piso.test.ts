import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * GATE del piso del escritorio.
 *
 * El fondo carga la tesis del producto: se raya en la proporción del último día
 * sin precio de referencia. Tres propiedades lo sostienen y ninguna se ve a ojo,
 * así que se fijan acá.
 */
describe('gate: el piso raya el dato y se mueve sin repintar', () => {
  const css = readFileSync('src/app/theme.css', 'utf8')
  const page = readFileSync('src/app/page.tsx', 'utf8')

  const regla = (sel: string) => {
    const i = css.indexOf(sel + ' {')
    if (i < 0) return null
    return css.slice(i, css.indexOf('}', i))
  }

  it('el ancho del piso lo pone el DATO, no una constante', () => {
    // Si alguien reemplaza `var(--ciego)` por un porcentaje fijo, el fondo pasa
    // a ser decoración — y la §7 prohíbe el movimiento decorativo. El gate no
    // puede ver si "informa", pero sí puede ver que el ancho venga de la variable.
    const piso = regla('.piso')
    expect(piso).not.toBeNull()
    expect(piso!).toContain('var(--ciego')
  })

  it('la variable la calcula fraccionCiega y no el componente', () => {
    // La lección que este proyecto ya pagó: dos lugares calculando lo mismo
    // divergen. El reloj, la fachada y el piso cuelgan del mismo `ultimoTrade`.
    expect(page).toContain('fraccionCiega(ultimoTrade, now)')
    expect(page).toContain("'--ciego'")
  })

  it('la animación va por TRANSFORM, que no repinta', () => {
    // La primera versión animaba `background-position` sobre una capa de
    // 1344x2513 siete veces por segundo. No se pudo medir el costo (el panel
    // estaba throttleado), así que se eligió la implementación que no necesita
    // medirse. Volver a `background-position` reintroduce esa incógnita.
    const marco = /@keyframes rayado \{([^]*?)\n\}/.exec(css)?.[1] ?? ''
    expect(marco).toContain('transform')
    expect(marco).not.toContain('background-position')
  })

  it('se mueve en pasos, no interpolando, como el resto de la página', () => {
    const inner = regla('.piso > i')
    expect(inner).not.toBeNull()
    expect(inner!).toMatch(/animation:\s*rayado\s+\S+\s+steps\(/)
  })

  it('el interior sobresale, o el corrimiento dejaría ver su borde', () => {
    const inner = regla('.piso > i')!
    expect(inner).toContain('left: -10px')
    expect(inner).toContain('calc(100% + 20px)')
  })

  it('respeta prefers-reduced-motion de forma explícita', () => {
    const i = css.indexOf('prefers-reduced-motion')
    const bloques = css.slice(i)
    expect(bloques).toMatch(/\.piso > i \{\s*animation: none;/)
  })

  it('el piso no habla dos veces: va aria-hidden porque el hecho ya está en texto', () => {
    expect(page).toContain('className="piso" aria-hidden="true"')
  })
})
