import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CLAVE_LUZ, luzGuardada, notaDeOverride, paraGuardar, scriptPrePintado } from './luz'

describe('luzGuardada', () => {
  it('solo el valor exacto enciende', () => {
    expect(luzGuardada('on')).toBe(true)
  })

  it('cae del lado del defecto ante cualquier otra cosa', () => {
    // El papel siguiendo al mercado es el comportamiento correcto; el override
    // es la excepcion y tiene que pedirse explicito. Basura guardada, un valor
    // de otra version, o nada, tienen que dejar la lampara apagada.
    for (const bruto of [null, '', 'ON', 'true', '1', 'off', 'plegada', '{"on":true}']) {
      expect(luzGuardada(bruto)).toBe(false)
    }
  })
})

describe('paraGuardar', () => {
  it('apagar BORRA la clave en vez de escribir off', () => {
    // Asi el almacenamiento no acumula claves muertas y el defecto es la
    // ausencia, que es lo mismo que lee una visita nueva.
    expect(paraGuardar(false)).toBeNull()
    expect(paraGuardar(true)).toBe('on')
  })

  it('la clave comparte prefijo con el resto del estado de la pagina', () => {
    expect(CLAVE_LUZ.startsWith('afterhours.')).toBe(true)
  })
})

describe('notaDeOverride', () => {
  it('con la lampara apagada no hay nada que aclarar', () => {
    // Una nota permanente diluiria la que importa.
    expect(notaDeOverride(false)).toBeNull()
  })

  it('encendida, la pagina admite que el papel dejo de ser el reloj', () => {
    const nota = notaDeOverride(true)
    expect(nota).not.toBeNull()
    expect(nota!.toLowerCase()).toContain('not the clock')
  })
})

/**
 * GATE: la lampara no puede ser una puerta trasera para el lima.
 *
 * Es el riesgo real y esta medido, no imaginado: `[data-phase="day"] .sprite`
 * carga la hoja de la analista CON lima, y el tercer juicio midio 4.731 px de
 * lima de marca en pantalla a las 2 de la manana cuando esa hoja se mostraba
 * fuera de su fase. Si el override tocara `data-phase` en vez de definir sus
 * propios tokens, ese bloqueante volveria entero — y ninguna prueba de unidad
 * sobre `luz.ts` lo veria, porque el defecto vive en el CSS y en el componente.
 */
describe('gate: la lampara no toca la fase ni devuelve el lima', () => {
  const css = readFileSync('src/app/theme.css', 'utf8')

  /**
   * El gate mira CODIGO, no prosa.
   *
   * Sin esto disparaba sobre los propios comentarios del componente, que dicen
   * "no se llama ThemeToggle" y explican por que no se toca `data-phase`. Un
   * gate que prohibe NOMBRAR el defecto castiga justo a la documentacion que lo
   * previene, y el arreglo obvio —borrar el comentario— empeora el archivo.
   */
  const sinComentarios = (txt: string) =>
    txt.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')

  const componente = sinComentarios(readFileSync('src/app/lampara.tsx', 'utf8'))

  /** Las reglas cuyo selector menciona el override. */
  const reglasDeLuz = [...css.matchAll(/([^{}]*\[data-luz[^{}]*)\{([^}]*)\}/g)].map((m) => ({
    selector: m[1]!.trim(),
    cuerpo: m[2]!,
  }))

  it('el bloque de la lampara existe y define el papel', () => {
    expect(reglasDeLuz.length).toBeGreaterThan(0)
    const tokens = reglasDeLuz.find((r) => r.cuerpo.includes('--paper'))
    expect(tokens).toBeDefined()
  })

  it('NINGUNA regla del override menciona el lima', () => {
    for (const r of reglasDeLuz) {
      expect(r.cuerpo.toLowerCase()).not.toContain('ccff00')
    }
  })

  it('el bloque principal NO fija el acento: se hereda de la fase', () => {
    // La primera version lo clavaba en tinta y con el mercado ABIERTO apagaba
    // el lima del badge y de la fachada — una senial que era cierta — mientras
    // la hoja de sprites lo conservaba. El lima es semantico, no de contraste.
    const tokens = reglasDeLuz.find((r) => r.cuerpo.includes('--paper'))!
    expect(tokens.cuerpo).not.toContain('--accent')
  })

  it('el acento se re-neutraliza SOLO fuera de day, y con la tinta nueva', () => {
    const neutral = reglasDeLuz.find((r) => r.cuerpo.includes('--accent'))
    expect(neutral).toBeDefined()
    // La condicion es lo que hace que el lima sobreviva con el mercado abierto.
    expect(neutral!.selector).toContain(':not([data-phase="day"])')
    expect(neutral!.cuerpo).toContain('var(--ink)')
  })

  it('el retrato de noche conserva su fondo, y SOLO en esa combinacion', () => {
    // `analyst-night.png` es la unica hoja con su papel horneado (medido: 85 %
    // de sus pixeles opacos superiores a distancia <= 8 de #141426, contra 0 %
    // en day/dusk/dawn). Con la lampara puesta y sin esta regla el grano queda
    // a la vista sobre crema y se lee como un PNG sucio.
    const regla = reglasDeLuz.find((r) => r.selector.includes('.avatar'))
    expect(regla).toBeDefined()
    // Acotada a night: darsela a las otras tres les pondria un recuadro oscuro
    // que no necesitan, porque son recortes limpios.
    expect(regla!.selector).toContain('[data-phase="night"]')
    expect(regla!.cuerpo).toContain('background')
  })

  it('el componente NUNCA escribe data-phase', () => {
    // La fase es una afirmacion sobre el mercado. La lampara enciende la pieza.
    expect(componente).not.toContain('data-phase')
  })

  it('el componente solo escribe su propio atributo', () => {
    const atributos = [...componente.matchAll(/(?:set|remove)Attribute\(\s*'([^']+)'/g)].map(
      (m) => m[1],
    )
    expect(atributos.length).toBeGreaterThan(0)
    expect(new Set(atributos)).toEqual(new Set(['data-luz']))
  })

  it('no se llama ThemeToggle ni usa la metafora sol/luna, que la §7 prohibe', () => {
    const prohibido = /themetoggle|\bsun\b|\bmoon\b|dark mode|light mode/i
    expect(prohibido.test(componente)).toBe(false)
    for (const r of reglasDeLuz) expect(prohibido.test(r.selector)).toBe(false)
  })
})

describe('scriptPrePintado', () => {
  const js = scriptPrePintado()

  it('lee la MISMA clave que el componente', () => {
    // Son dos lugares que tienen que decir lo mismo. Si la clave del layout se
    // desincroniza, la preferencia se guarda y no se aplica antes del pintado:
    // el destello vuelve y nadie lo nota, porque todo lo demas sigue andando.
    expect(js).toContain(CLAVE_LUZ)
  })

  it('enciende con el MISMO valor que reconoce luzGuardada', () => {
    const valor = /=== *'([^']+)'/.exec(js)?.[1]
    expect(valor).toBeDefined()
    expect(luzGuardada(valor!)).toBe(true)
  })

  it('pone el atributo del override y NO la fase', () => {
    expect(js).toContain("setAttribute('data-luz','on')")
    expect(js).not.toContain('data-phase')
  })

  it('esta envuelto en try/catch: el almacenamiento bloqueado no puede romper el head', () => {
    // Es un script BLOQUEANTE. Si tira, se lleva el primer pintado con el.
    expect(js.startsWith('try{')).toBe(true)
    expect(js).toContain('catch')
  })

  it('el layout usa el generador y no una cadena escrita a mano', () => {
    const layout = readFileSync('src/app/layout.tsx', 'utf8')
    expect(layout).toContain('scriptPrePintado()')
    expect(layout).not.toContain('afterhours.luz')
  })
})
