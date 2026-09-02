import { STREET_RATIO, STREET_WINDOWS } from './street-windows'

const TOTAL = STREET_WINDOWS.length

/**
 * El estado del edificio. Vive acá y no en la página para que la cuenta de la
 * barra de título y el dibujo no puedan divergir.
 *
 * LA UNIDAD ES LA RANURA, NO LA LECTURA. Primero conté una ventana por lectura
 * tomada sobre las 159 que trae el dibujo, y un juez fresco lo partió con
 * aritmética: una noche de semana son 17 h, o sea 68 corridas programadas, así
 * que el edificio NUNCA podía pasar del 43 % y al amanecer el instrumento
 * decía "43 % lleno" con la noche entera cumplida. 159 era una constante del
 * asset, no una unidad del mundo.
 *
 * Ahora cada ventana es una CORRIDA PROGRAMADA del cierre en curso, encendida
 * si esa corrida efectivamente ocurrió. Con eso el edificio lleno significa
 * registro completo, y —lo que vale más— las corridas perdidas quedan marcadas
 * y apagadas: los huecos del archivo pasan a ser arquitectura en vez de una
 * nota al pie.
 *
 * Y son TRES estados, no dos: la ranura EN CURSO todavía no puede haber
 * fallado. Contarla como perdida hacía que la lectura más reciente nunca
 * pudiera encender su ventana, y el panel se contradecía con el de al lado —
 * decía 0 de 1 encendida con una lectura de hace cuatro minutos en pantalla.
 */
export type Ranura = 'ok' | 'pendiente' | 'perdida'

export function resumenFachada({
  abierto,
  ranuras,
  desconocido,
}: {
  abierto: boolean
  /** Una entrada por corrida programada del tramo cerrado. */
  ranuras: readonly Ranura[]
  /** La fuente no respondió: no se inventa un estado, no se enciende nada. */
  desconocido: boolean
}) {
  if (desconocido)
    return { encendidas: 0, perdidas: 0, pendientes: 0, programadas: 0, total: TOTAL }
  if (abierto)
    return { encendidas: TOTAL, perdidas: 0, pendientes: 0, programadas: TOTAL, total: TOTAL }
  // El techo del dibujo nunca aprieta: `runs` sólo puede testificar 24 h, o sea
  // 96 ranuras como mucho, y la fachada tiene 159.
  const usadas = ranuras.slice(0, TOTAL)
  return {
    encendidas: usadas.filter((r) => r === 'ok').length,
    perdidas: usadas.filter((r) => r === 'perdida').length,
    pendientes: usadas.filter((r) => r === 'pendiente').length,
    programadas: usadas.length,
    total: TOTAL,
  }
}

/**
 * LA FACHADA — el registro de la noche dibujado como un edificio.
 *
 * EL COLOR ESTÁ DOBLEMENTE ATADO, igual que `.badge`: el lima sólo puede
 * aparecer con `data-phase="day"` Y con el mercado abierto, y siempre como
 * SUPERFICIE (un bloque sin texto encima), nunca como color de tinta.
 *
 * Cerrado, la ventana encendida es el naranja de la lámpara —el mismo de la
 * barra del reloj de noche y por la misma razón— y la ranura que no ocurrió
 * queda con un relleno apagado, el mismo vocabulario que la tira del archivo:
 * la casilla existe y se ve que no pasó nada.
 *
 * Las cajas de las ventanas salen MEDIDAS del PNG (scripts/build-street.py),
 * no estimadas: el modelo dibuja el edificio, el código impone dónde y de qué
 * color se enciende.
 */
export function Street({
  abierto,
  ranuras,
  desconocido,
  acotado,
}: {
  abierto: boolean
  ranuras: readonly Ranura[]
  desconocido: boolean
  /** El tramo es más largo que las 24 h sobre las que `runs` puede testificar. */
  acotado?: boolean
}) {
  const { encendidas, perdidas, pendientes, programadas } = resumenFachada({
    abierto,
    ranuras,
    desconocido,
  })
  // El texto NO puede decir "desde la campana" cuando la cuenta está acotada a
  // 24 h: un domingo a la tarde van ~260 corridas desde el viernes y la página
  // diría 96 con esas palabras. Número falso en prosa afirmativa.
  const desde = acotado ? 'in the last 24 hours' : 'since the bell'

  const leyenda = desconocido
    ? 'Market state unknown, so nothing is lit. The building is drawn from the reading, not from the clock on your machine.'
    : abierto
      ? 'Wall Street is open, so the whole building is lit. At the bell every window goes dark but hers.'
      : programadas === 0
        ? 'The bell rang and the first scheduled run has not come round yet.'
        : `One window per scheduled run ${desde}: ${programadas} due, ${encendidas} lit${
            perdidas === 0
              ? '. None missed, so far.'
              : `, and ${perdidas} crossed out for runs that never happened. A gap in the archive is a window that stays out.`
          }${pendientes > 0 ? ' The last one is still due.' : ''}`

  return (
    <>
      <div
        className="street"
        data-abierto={abierto && !desconocido ? 'true' : 'false'}
        style={{ aspectRatio: String(STREET_RATIO) }}
        role="img"
        aria-label={
          desconocido
            ? 'The building outside, entirely dark: the market state is unknown.'
            : abierto
              ? 'The building outside, every window lit: Wall Street is open.'
              : `The building outside: ${encendidas} lit ${encendidas === 1 ? 'window' : 'windows'}, one for every run recorded ${desde}, and ${perdidas} crossed out for the runs that never happened.`
        }
      >
        {STREET_WINDOWS.slice(0, abierto && !desconocido ? TOTAL : programadas).map(
          ([x, y, w, h], i) => (
            // La ranura EN CURSO se dibuja vacia: es el futuro, no un hueco.
            // Va al DOM igual —y no como `null`— para que la cuenta de la barra
            // de titulo y la cantidad de elementos no puedan divergir; es lo que
            // hace verificable que el dibujo diga lo mismo que el numero.
            <i
              key={i}
              data-perdida={!abierto && ranuras[i] === 'perdida' ? 'true' : undefined}
              data-pendiente={!abierto && ranuras[i] === 'pendiente' ? 'true' : undefined}
              style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` }}
            />
          ),
        )}
      </div>
      <p className="note streetNote">{leyenda}</p>
    </>
  )
}

export { TOTAL as STREET_TOTAL }
