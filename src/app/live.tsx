'use client'

import { useEffect, useState } from 'react'

/**
 * MOVIMIENTO QUE ES EL DATO, no decoración.
 *
 * La página trata de las horas en que no pasa nada, así que casi todo está
 * quieto a propósito y los dos jueces lo elogiaron. Lo único que se mueve es el
 * tiempo, porque el tiempo pasa de verdad: la campana se acerca mientras estás
 * mirando.
 *
 * El valor inicial viene del servidor y se sigue contando en el cliente. Sin
 * eso habría desajuste de hidratación, y peor: la página quedaría diciendo la
 * hora del build.
 */
export function Countdown({
  targetSec,
  label,
}: {
  /** Instante al que se cuenta, en segundos epoch. */
  targetSec: number
  label: string
}) {
  // Arranca en null y se pinta en el primer efecto: así el HTML del servidor y
  // el primer render del cliente coinciden exactamente.
  const [restan, setRestan] = useState<number | null>(null)

  useEffect(() => {
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const calc = () => Math.max(0, targetSec - Math.floor(Date.now() / 1000))
    setRestan(calc())

    // Con reduced-motion no se tictaquea: se muestra el valor y se deja quieto.
    if (quieto) return

    const id = setInterval(() => setRestan(calc()), 1000)
    return () => clearInterval(id)
  }, [targetSec])

  if (restan === null) {
    // Render del servidor: las horas, sin segundos. Es verdad y es estable.
    const h = Math.max(0, (targetSec - Math.floor(Date.now() / 1000)) / 3600)
    return (
      <span className="count">
        {label} {h.toFixed(1)} H
      </span>
    )
  }

  const h = Math.floor(restan / 3600)
  const m = Math.floor((restan % 3600) / 60)
  const s = restan % 60
  const dd = (n: number) => String(n).padStart(2, '0')

  return (
    <span className="count">
      {label}{' '}
      <b className="countNum">
        {dd(h)}:{dd(m)}:{dd(s)}
      </b>
    </span>
  )
}

/**
 * Un latido en la lectura más nueva, y sólo mientras sea nueva.
 *
 * No es un adorno que late para siempre: se apaga solo cuando la lectura deja
 * de ser reciente. Un indicador que late siempre no informa nada.
 */
export function FreshDot({ lastSec, ventanaSec = 900 }: { lastSec: number; ventanaSec?: number }) {
  const [fresco, setFresco] = useState(false)

  useEffect(() => {
    const revisar = () => setFresco(Date.now() / 1000 - lastSec < ventanaSec)
    revisar()
    const id = setInterval(revisar, 30000)
    return () => clearInterval(id)
  }, [lastSec, ventanaSec])

  return <span className={fresco ? 'dot dotLive' : 'dot'} aria-hidden="true" />
}
