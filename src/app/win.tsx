'use client'

import { useEffect, useState, type ReactNode } from 'react'

/**
 * Panel del escritorio.
 *
 * LOS TRES BOTONES DE LA BARRA AHORA HACEN ALGO. Eran decorativos: 33
 * affordances en la pagina que no respondian a nada, que es exactamente el
 * cargo de "interfaz falsa" — y en una pagina cuya premisa ES un escritorio,
 * es el detalle mas barato de arreglar y el mas caro de dejar roto.
 *
 * `_` y `x` pliegan el panel a su barra de titulo, `[]` lo devuelve. Que la
 * cruz PLIEGUE en vez de cerrar es deliberado y no es un atajo: un "cerrar"
 * sin camino de vuelta deja que una visita rompa la pagina y no pueda
 * recomponerla, y este sitio es un instrumento, no una ventana de sistema.
 * Nada se puede perder: todo estado es reversible desde la misma barra.
 *
 * El estado arranca SIEMPRE desplegado y se lee de localStorage recien en el
 * efecto: si el primer render dependiera del almacenamiento, el servidor y el
 * cliente escribirian arboles distintos y la hidratacion se rompe.
 */
export function Win({
  title,
  className,
  stale,
  count,
  children,
}: {
  title: string
  className: string
  stale?: boolean
  /** Cuenta en la barra de titulo: dice cuantas filas hay aunque nadie scrollee. */
  count?: string
  children: ReactNode
}) {
  const [plegada, setPlegada] = useState(false)
  const clave = `afterhours.win.${className}`

  useEffect(() => {
    try {
      if (localStorage.getItem(clave) === 'plegada') setPlegada(true)
    } catch {
      // Almacenamiento bloqueado: el panel simplemente queda desplegado.
    }
  }, [clave])

  const cambiar = (v: boolean) => {
    setPlegada(v)
    try {
      if (v) localStorage.setItem(clave, 'plegada')
      else localStorage.removeItem(clave)
    } catch {
      // No poder recordarlo no puede impedir usarlo.
    }
  }

  return (
    <section className={`win ${className}${stale ? ' stale' : ''}${plegada ? ' plegada' : ''}`}>
      <header>
        <h2>{title}</h2>
        {count ? <span className="cuenta">{count}</span> : null}
        <span className="boxes">
          <button
            type="button"
            className="bMin"
            onClick={() => cambiar(true)}
            aria-expanded={!plegada}
            aria-label={`Collapse ${title}`}
          />
          <button
            type="button"
            className="bMax"
            onClick={() => cambiar(false)}
            aria-expanded={!plegada}
            aria-label={`Expand ${title}`}
          />
          <button
            type="button"
            className="bClose"
            onClick={() => cambiar(true)}
            aria-expanded={!plegada}
            aria-label={`Collapse ${title}`}
          />
        </span>
      </header>
      {plegada ? null : <div className="body">{children}</div>}
    </section>
  )
}
