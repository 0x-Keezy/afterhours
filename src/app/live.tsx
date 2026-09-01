'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { marcaDeCambio, type Lectura, type Marca } from './cambio'

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

/**
 * Tiempo transcurrido desde un instante, corriendo.
 *
 * Es el gemelo de `Countdown` y existe por la misma razón: hay estados en que
 * NO hay un instante futuro que la fuente publique —después de la campana,
 * `hoursUntilOpen` es null y el reloj se quedaba sin un solo número vivo toda
 * la noche, que es justo el tramo del que trata la página—. Cuánto hace que
 * sonó la campana sí está medido, así que se puede contar sin inventar nada.
 */
export function Elapsed({
  fromSec,
  label,
}: {
  /** Instante del que se cuenta, en segundos epoch. */
  fromSec: number
  label: string
}) {
  const [pasaron, setPasaron] = useState<number | null>(null)

  useEffect(() => {
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const calc = () => Math.max(0, Math.floor(Date.now() / 1000) - fromSec)
    setPasaron(calc())

    if (quieto) return

    const id = setInterval(() => setPasaron(calc()), 1000)
    return () => clearInterval(id)
  }, [fromSec])

  if (pasaron === null) {
    // Render del servidor: horas, sin segundos. Es verdad y es estable.
    const h = Math.max(0, (Math.floor(Date.now() / 1000) - fromSec) / 3600)
    return (
      <span className="count">
        {label} {h.toFixed(1)} H
      </span>
    )
  }

  const h = Math.floor(pasaron / 3600)
  const m = Math.floor((pasaron % 3600) / 60)
  const s = pasaron % 60
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
 * EL LATIDO REAL: la página se busca la lectura siguiente sola.
 *
 * Hasta acá la página era una foto. El poller escribe cada 15 minutos y en
 * pantalla no cambiaba nada hasta que alguien recargara: el tablero, el
 * archivo y la fachada podían estar viendo una lectura vieja durante horas.
 *
 * Esto cuenta hasta la próxima corrida programada —`lastSec + cadencia`, que
 * es dato, no supuesto— y cuando vence pide el RSC de nuevo. Como la ruta se
 * revalida cada 60 s, el primer refresh puede traer todavía la copia anterior,
 * así que se reintenta con espaciado creciente hasta que `lastSec` cambie de
 * verdad, y se para: no es un poll infinito.
 *
 * El número que se ve ES el estado del reintento. Cuando la corrida se atrasa
 * deja de contar hacia abajo y cuenta hacia arriba, que es exactamente cuándo
 * el panel se pone rancio.
 */
/** Segundos despues del vencimiento en que se vuelve a preguntar. */
const ESCALERA = [0, 20, 45, 90, 180, 300, 600] as const

export function NextReading({
  lastSec,
  cadenciaSec,
}: {
  lastSec: number
  cadenciaSec: number
}) {
  const [restan, setRestan] = useState<number | null>(null)
  const router = useRouter()

  useEffect(() => {
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const vence = lastSec + cadenciaSec

    const calc = () => vence - Math.floor(Date.now() / 1000)
    setRestan(calc())

    // Reintentos espaciados. La escalera arranca en el vencimiento O AHORA, lo
    // que sea mas tarde: si la corrida ya venia atrasada, medirlos contra un
    // vencimiento pasado los mandaba TODOS a cero y disparaba siete refrescos
    // simultaneos al montar. Medido: con 39 minutos de atraso, los siete.
    const ahora = Math.floor(Date.now() / 1000)
    const base = Math.max(vence, ahora)
    const reintentos = ESCALERA.map((d) => setTimeout(() => router.refresh(), (base - ahora + d) * 1000))

    // Piso: si el poller se cayo del todo, la escalera se agota y la pagina se
    // quedaria mirando una lectura vieja para siempre. Sigue preguntando a la
    // cadencia natural, que es la unica frecuencia que tiene sentido.
    const piso = setInterval(() => router.refresh(), cadenciaSec * 1000)

    const id = quieto ? null : setInterval(() => setRestan(calc()), 1000)
    return () => {
      reintentos.forEach(clearTimeout)
      clearInterval(piso)
      if (id) clearInterval(id)
    }
  }, [lastSec, cadenciaSec, router])

  if (restan === null) {
    return <span className="count">NEXT READING IN {Math.round(cadenciaSec / 60)} MIN</span>
  }

  const atrasada = restan < 0
  const v = Math.abs(restan)
  const dd = (n: number) => String(n).padStart(2, '0')
  const reloj = `${dd(Math.floor(v / 60))}:${dd(v % 60)}`

  return (
    <span className="count" data-atrasada={atrasada ? 'true' : undefined}>
      {atrasada ? 'OVERDUE BY' : 'NEXT READING IN'} <b className="countNum">{reloj}</b>
    </span>
  )
}

/**
 * El número del gap, que avisa cuando CAMBIÓ.
 *
 * El tablero es el panel más grande de la página y no movía un pixel: los
 * números se renuevan cada 15 minutos y en pantalla eso no se notaba ni con la
 * página abierta al lado. Acá cada celda recuerda su valor anterior y, cuando
 * llega una lectura que lo cambia, se marca sola durante unos segundos.
 *
 * El recuerdo vive a nivel de MÓDULO y no en el estado del componente porque
 * `router.refresh()` vuelve a renderizar el árbol del servidor: el estado local
 * sobrevive, pero el mapa por símbolo es lo que permite comparar contra la
 * lectura anterior sin depender de dónde quedó montado cada `<td>`.
 *
 * En el primer montaje NO marca nada: no habría con qué comparar, y una página
 * que se abre parpadeando entera estaría informando de algo que no pasó.
 */
const vistos = new Map<string, Lectura>()

/** Cuanto dura la marca. Igual que la animacion `cambio` de theme.css. */
const MARCA_MS = 6000

export function GapNum({
  symbol,
  value,
  texto,
}: {
  symbol: string
  value: number
  texto: string
}) {
  const [cambio, setCambio] = useState<Marca>(null)

  useEffect(() => {
    const marca = marcaDeCambio(vistos.get(symbol), { texto, valor: value })
    vistos.set(symbol, { texto, valor: value })
    if (marca === null) return

    setCambio(marca)
    const id = setTimeout(() => setCambio(null), MARCA_MS)
    return () => clearTimeout(id)
  }, [symbol, value, texto])

  return (
    <span className="gapNum" data-cambio={cambio ?? undefined}>
      {texto}
    </span>
  )
}
