import { GAP_UMBRAL_SEC } from './archive'
import { calibration, robustZ } from './gap'
import type { Sample } from './types'

/** Un punto de la serie de un ticker: instante y gap. */
export type SeriePunto = { t: number; g: number }

export type BoardRow = {
  symbol: string
  gapPct: number
  z: number | null
  calibrating: boolean
  progress: number
  liquidityUsd: number
  /**
   * La historia del gap de ESTE ticker, en orden cronológico.
   *
   * La página afirma que "el valor es el archivo, no la lectura" y hasta ahora
   * no mostraba ni una serie: sólo el número derivado. Con esto cada fila puede
   * dibujar su propia forma en el tiempo, que es la afirmación hecha visible.
   *
   * Lleva el instante y no sólo el valor: las corridas pueden faltar, y dibujar
   * por índice cuando hay huecos es mentir sobre cuándo pasó cada cosa.
   */
  serie: SeriePunto[]
  /**
   * Instante de la PRIMERA lectura de la racha final con el mismo precio on-chain,
   * o `null` si el precio cambió en la última lectura.
   *
   * La racha se CORTA en los huecos del archivo (ver `quietoDesde`), y se dibuja
   * midiendo hasta la última lectura y no hasta el ahora. Las dos cosas salieron
   * de un panel adversarial el 2026-09-03 que midió que la primera versión
   * afirmaba continuidad donde no la había: el titular de GPRO decía 28 h con
   * **712 minutos (41,6 %) sin una sola lectura adentro**, y dos de esos huecos
   * eran las corridas estériles que este mismo trabajo vino a arreglar. La página
   * dice dos párrafos más arriba que los huecos "se muestran en vez de alisarse":
   * esta columna los estaba alisando.
   *
   * Es una medición, no un veredicto, y esa distinción es el punto. La página
   * mide "deriva del precio on-chain sin ancla de referencia": un precio que no
   * se mueve hace 27 horas NO está derivando — es una punta parada, y su gap dice
   * otra cosa que el de al lado. Hasta ahora el tablero los mostraba iguales.
   *
   * Se descartó a propósito marcarlos como "sospechosos" con un umbral: se midió
   * el 2026-09-03 que las tres reglas candidatas (gap+liquidez, piso de volumen,
   * racha de precio) no discriminan — el volumen 24 h es una ventana que se drena
   * y GPRO tenía 1,2 M en la lectura 9 de una congelación de 27 h. Además el
   * orden por `z` ya manda las congeladas al fondo solo (su MAD es 0, así que
   * `robustZ` devuelve null) en cuanto haya banda. Decir cuánto hace que no se
   * mueve deja el juicio en el lector, que es el registro del resto de la página.
   */
  stillSince: number | null
}

/**
 * Con qué criterio quedó ordenado el tablero. Mientras TODO calibra no hay z, y
 * decir "ordenado por anomalía" sería una afirmación que el dato no sostiene.
 */
export type BoardOrder = 'anomaly' | 'liquidity'

export type Board = { rows: BoardRow[]; samples: number; orderedBy: BoardOrder }

/**
 * Desde cuándo no cambia el precio on-chain, mirando la racha FINAL de la serie.
 *
 * Devuelve el instante de la primera lectura de esa racha —no su duración— para
 * que quien dibuje elija la unidad. Con menos de dos lecturas devuelve `null`:
 * una sola observación no puede probar quietud.
 *
 * **La racha se corta en un hueco del archivo.** Si entre dos lecturas pasó más
 * que `GAP_UMBRAL_SEC` —el mismo umbral con el que `archiveStats` declara un
 * hueco— entonces el poller no estuvo mirando, y extender la racha por encima de
 * ese silencio sería afirmar una continuidad que nadie observó. Un instrumento
 * que mide huecos no puede tapar los suyos: la racha vale hasta donde llega la
 * observación y ni un segundo más.
 */
export function quietoDesde(serie: { t: number; p: number }[]): number | null {
  if (serie.length < 2) return null
  const ultimo = serie[serie.length - 1]!
  let i = serie.length - 1
  while (i > 0 && serie[i - 1]!.p === ultimo.p && serie[i]!.t - serie[i - 1]!.t <= GAP_UMBRAL_SEC) {
    i--
  }
  return i === serie.length - 1 ? null : serie[i]!.t
}

export function buildBoard(history: Sample[], latest: Sample[], _nowSec: number): Board {
  // Ordenado por instante: `history` no garantiza orden cronológico, y una serie
  // desordenada dibuja una forma que no ocurrió.
  const porSimbolo = new Map<string, SeriePunto[]>()
  // El precio va aparte y NO entra en `serie`: el sparkline no lo necesita y
  // `serie` viaja al cliente en cada fila. Lo que cruza es el derivado, no la
  // serie de precios entera.
  const precios = new Map<string, { t: number; p: number }[]>()
  for (const h of [...history].sort((a, b) => a.t - b.t)) {
    porSimbolo.set(h.symbol, [...(porSimbolo.get(h.symbol) ?? []), { t: h.t, g: h.gapPct }])
    precios.set(h.symbol, [...(precios.get(h.symbol) ?? []), { t: h.t, p: h.onchain }])
  }

  const rows: BoardRow[] = latest.map((l) => {
    const serie = porSimbolo.get(l.symbol) ?? []
    const valores = serie.map((p) => p.g)
    const { ready, progress } = calibration(valores.length)
    return {
      symbol: l.symbol,
      gapPct: l.gapPct,
      z: robustZ(l.gapPct, valores),
      calibrating: !ready,
      progress,
      liquidityUsd: l.liquidityUsd,
      serie,
      stillSince: quietoDesde(precios.get(l.symbol) ?? []),
    }
  })

  // Primero lo anómalo; lo que todavía calibra va al final, nunca mezclado. Entre
  // los que calibran no hay anomalía que comparar, así que se ordenan por liquidez
  // (determinista) en vez de quedar al azar del orden de llegada.
  rows.sort((a, b) => {
    if (a.calibrating !== b.calibrating) return a.calibrating ? 1 : -1
    if (a.calibrating) return b.liquidityUsd - a.liquidityUsd
    return Math.abs(b.z ?? 0) - Math.abs(a.z ?? 0)
  })

  const orderedBy: BoardOrder = rows.some((r) => !r.calibrating) ? 'anomaly' : 'liquidity'

  return { rows, samples: history.length, orderedBy }
}
