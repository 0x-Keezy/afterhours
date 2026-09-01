import { STREET_RATIO, STREET_WINDOWS } from './street-windows'

const TOTAL = STREET_WINDOWS.length

/**
 * Cuántas ventanas quedan encendidas. Vive acá y no en la página para que la
 * cuenta de la barra de título y el dibujo no puedan divergir.
 */
export function ventanasEncendidas({
  abierto,
  lecturas,
  desconocido,
}: {
  abierto: boolean
  lecturas: number
  desconocido: boolean
}) {
  if (desconocido) return 0
  return abierto ? TOTAL : Math.min(lecturas, TOTAL)
}

/**
 * LA FACHADA — el estado del mercado dibujado como un edificio.
 *
 * Mide, no decora. Una ventana encendida = una lectura tomada dentro del tramo
 * cerrado en curso, así que el edificio se va llenando de luz a lo largo de la
 * noche y con el mercado abierto está entero encendido. Es el mismo número que
 * la leyenda del reloj de 24 h ya escribía en prosa, ahora en forma.
 *
 * EL COLOR ESTÁ DOBLEMENTE ATADO, igual que `.badge`: el lima sólo puede
 * aparecer con `data-phase="day"` Y con el mercado abierto, y siempre como
 * SUPERFICIE (un bloque sin texto encima), nunca como color de tinta.
 *
 * Cerrado, la ventana encendida es el naranja de la lámpara. Es el mismo
 * naranja que la barra del reloj de noche y por la misma razón: el edificio
 * está apagado salvo donde alguien se quedó.
 *
 * Las cajas de las ventanas salen MEDIDAS del PNG (scripts/build-street.py),
 * no estimadas: el modelo dibuja el edificio, el código impone dónde y de qué
 * color se enciende.
 */
export function Street({
  abierto,
  lecturas,
  desconocido,
}: {
  abierto: boolean
  /** Lecturas archivadas dentro del tramo cerrado en curso. */
  lecturas: number
  /** La fuente no respondió: no se inventa un estado, no se enciende nada. */
  desconocido: boolean
}) {
  const encendidas = ventanasEncendidas({ abierto, lecturas, desconocido })

  const leyenda = desconocido
    ? 'Market state unknown, so nothing is lit. The building is drawn from the reading, not from the clock on your machine.'
    : abierto
      ? 'Wall Street is open, so the whole building is lit. At the bell every window goes dark but hers.'
      : lecturas === 0
        ? 'The bell rang and no reading has landed inside this stretch yet.'
        : `One window per reading taken since the bell: ${lecturas.toLocaleString('en-US')} so far${
            lecturas > TOTAL ? `, and the facade only holds ${TOTAL}` : ''
          }. It fills up while nobody watches.`

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
              : `The building outside, dark except ${encendidas} lit ${encendidas === 1 ? 'window' : 'windows'}: one for every reading taken since the bell.`
        }
      >
        {STREET_WINDOWS.slice(0, encendidas).map(([x, y, w, h], i) => (
          <i
            key={i}
            style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` }}
          />
        ))}
      </div>
      <p className="note streetNote">{leyenda}</p>
    </>
  )
}

export { TOTAL as STREET_TOTAL }
