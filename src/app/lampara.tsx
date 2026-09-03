'use client'

import { useEffect, useState } from 'react'
import { CLAVE_LUZ, luzGuardada, notaDeOverride, paraGuardar } from './luz'

/**
 * El interruptor de la lámpara del escritorio.
 *
 * Vive DENTRO de la ventana del reloj a propósito: el reloj ya es la lámpara
 * del turno noche —es la única ventana que conserva el naranja cuando todo lo
 * demás se apaga—, así que el interruptor está sobre el objeto que enciende.
 * No es un tema, no es un sol y una luna, y no se llama ThemeToggle. Ver `luz.ts`.
 *
 * Arranca SIEMPRE apagado y lee el almacenamiento recién en el efecto, igual
 * que el plegado de `Win`: si el primer render dependiera de localStorage, el
 * servidor y el cliente escribirían árboles distintos y la hidratación se rompe.
 * Ese bug ya pasó en esta página (React #418) y no se reproduce en dev.
 */
export function Lampara() {
  const [encendida, setEncendida] = useState(false)

  useEffect(() => {
    let guardada = false
    try {
      guardada = luzGuardada(localStorage.getItem(CLAVE_LUZ))
    } catch {
      // Almacenamiento bloqueado: la lámpara queda apagada, que es el defecto.
    }
    setEncendida(guardada)
  }, [])

  // El atributo se pone en <html> y no en un contenedor: el papel tiene que
  // llegar al fondo del documento, o al hacer overscroll asoma el color de la
  // fase real por debajo. Es la misma razón por la que `data-phase` va ahí.
  useEffect(() => {
    const raiz = document.documentElement
    if (encendida) raiz.setAttribute('data-luz', 'on')
    else raiz.removeAttribute('data-luz')
  }, [encendida])

  const cambiar = () => {
    const v = !encendida
    setEncendida(v)
    try {
      const guardar = paraGuardar(v)
      if (guardar === null) localStorage.removeItem(CLAVE_LUZ)
      else localStorage.setItem(CLAVE_LUZ, guardar)
    } catch {
      // No poder recordarlo no puede impedir usarlo.
    }
  }

  const nota = notaDeOverride(encendida)

  return (
    <>
      <button
        type="button"
        className="bLuz"
        onClick={cambiar}
        aria-pressed={encendida}
        title={
          encendida
            ? 'Turn the desk lamp off and let the paper follow the market again'
            : 'Turn the desk lamp on. The paper stops following the market until you turn it off'
        }
      >
        <span className="bulbo" aria-hidden="true" />
        DESK LAMP
      </button>
      {nota ? <span className="sub luzNota">{nota}</span> : null}
    </>
  )
}
