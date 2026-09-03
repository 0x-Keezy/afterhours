import type { SeriePunto } from '../core/board'

const HORA = 3600
const VENTANA = 24 * HORA
const MEDIA = VENTANA / 2

/** Posición 0..1 de un instante dentro de la banda, centrada en `now`. */
function pos(t: number, now: number) {
  return (t - (now - MEDIA)) / VENTANA
}

function pct(x: number) {
  return `${(Math.min(1, Math.max(0, x)) * 100).toFixed(3)}%`
}

/**
 * EL RELOJ DE 24 HORAS — el instrumento que faltaba.
 *
 * La tesis del producto es que hay un tramo enorme del día en que el precio
 * on-chain se mueve sin que nadie mire. Hasta ahora eso sólo existía en prosa.
 * Acá se ve: la banda cubre 12 h para atrás y 12 h para adelante, con AHORA en
 * el centro, y el tramo cerrado ocupa lo que realmente ocupa.
 *
 * Sólo se dibuja lo que el dato PRUEBA:
 *  - el último trade real, que sale de `hoursSinceLastTrade`;
 *  - la ventana de sesión, tal como la publica la fuente.
 * No se reconstruyen sesiones anteriores asumiendo un horario fijo: eso se
 * rompe con feriados y fines de semana, y sería dibujar algo que no se midió.
 */
export function DayClock({
  now,
  session,
  runs,
  hoursSinceLastTrade,
  abierto,
  ranurasCumplidas,
}: {
  now: number
  session: { start: number; end: number } | null
  runs: number[]
  hoursSinceLastTrade: number | null
  abierto: boolean
  /**
   * Ranuras del tramo que efectivamente ocurrieron, calculadas UNA vez en la
   * pagina y compartidas con la fachada.
   *
   * No se recuentan acá a proposito. Contando `runs` el reloj decia 19 y la
   * fachada 18 en la misma pantalla: con corridas solapadas —que es el estado
   * normal desde que un job cubre 5,5 h— dos lecturas caen en la misma ranura
   * de 15 minutos, asi que "corridas" y "ranuras cumplidas" son numeros
   * distintos. Compartir la fuente hace que no puedan divergir nunca, que es
   * lo mismo que `street.tsx` ya hace entre su dibujo y su barra de titulo.
   */
  ranurasCumplidas: number
}) {
  const desde = now - MEDIA
  const hasta = now + MEDIA

  const ultimoTrade = hoursSinceLastTrade === null ? null : now - hoursSinceLastTrade * HORA

  // El tramo cerrado: desde que dejó de haber trades reales hasta que suena la
  // campana. Es el sujeto del producto, así que es lo que más pesa en el dibujo.
  const cierraEn = ultimoTrade
  const abreEn = session ? session.start : null

  // EL TRAMO CERRADO SE DIBUJA SIEMPRE QUE HAYA UNO, aunque no se sepa cuándo
  // termina. Antes exigía `abreEn > cierraEn`, y eso es falso todas las tardes:
  // después de la campana, `session.start` es el 09:30 de HOY, o sea ANTERIOR
  // al último trade. Resultado medido: desde el cierre hasta que la fuente rota
  // su `currentTradingPeriod`, el riel dibujaba el bloque de la sesión que ya
  // terminó y dejaba la mitad derecha —la noche, el sujeto entero del
  // producto— en blanco. Sistemático, todos los días hábiles.
  //
  // Cuando la próxima apertura no está publicada, el tramo se dibuja ABIERTO
  // hacia el futuro: llega hasta el borde y no se le pinta campana. Es
  // estrictamente más honesto que no dibujar nada — el hecho medido es "no hay
  // precio de referencia desde la campana", y eso es cierto con o sin la hora
  // de reapertura.
  const abreConocido = abreEn !== null && abreEn > cierraEn!
  const mostrarCerrado = !abierto && cierraEn !== null && cierraEn < hasta

  // TRANSCURRIDO Y FALTANTE, SEPARADOS. Antes esto era una sola cifra que, con
  // la proxima apertura publicada, valia `hoursSinceLastTrade + hoursUntilOpen`
  // — o sea el tramo COMPLETO proyectado — y se imprimia con la palabra
  // "so far", que afirma tiempo ya pasado. Medido en produccion: decia 17,5 h
  // tres lineas debajo de su propio "CLOSED FOR 10.8 H", sobrestimando en 62 %
  // la magnitud que es la tesis entera del producto. El dibujo lo confesaba:
  // 27,6 puntos de la franja caian a la DERECHA de AHORA.
  const horasTranscurridas = mostrarCerrado ? (now - cierraEn!) / HORA : null
  const horasFaltan = mostrarCerrado && abreConocido ? (abreEn! - now) / HORA : null
  // Las corridas son las del TRAMO y salen de la MISMA fuente que la fachada:
  // `runs.length` incluia corridas anteriores a la campana (el reloj decia 27
  // donde el panel de al lado decia 18), y recontarlas acá volvia a divergir
  // por uno en cuanto dos lecturas caian en la misma ranura.
  const corridasDentro = ranurasCumplidas

  const enBanda = (t: number) => t >= desde && t <= hasta

  return (
    <div className="dayclock">
      <div className="dcTrack">
        {/* El tramo sin ancla. Lo que la página venía afirmando en palabras. */}
        {mostrarCerrado ? (
          <span
            className="dcClosed"
            data-abierto-al-futuro={abreConocido ? undefined : 'true'}
            style={{
              left: pct(pos(cierraEn!, now)),
              right: abreConocido ? pct(1 - pos(abreEn!, now)) : 0,
            }}
          />
        ) : null}

        {/* La sesión regular, tal como la publica la fuente. */}
        {session ? (
          <span
            className="dcOpen"
            style={{ left: pct(pos(session.start, now)), right: pct(1 - pos(session.end, now)) }}
          />
        ) : null}

        {/* Cada lectura archivada, en su instante real. */}
        {runs.filter(enBanda).map((t) => (
          <span key={t} className="dcRun" style={{ left: pct(pos(t, now)) }} />
        ))}

        {/* La campana. */}
        {session && enBanda(session.start) ? (
          <span className="dcBell" style={{ left: pct(pos(session.start, now)) }} />
        ) : null}

        <span className="dcNow" />
      </div>

      <div className="dcScale" aria-hidden="true">
        <span>12 H BACK</span>
        <span className="dcNowLabel">NOW</span>
        <span>12 H AHEAD</span>
      </div>

      <p className="dcLegend">
        {horasTranscurridas !== null
          ? `${horasTranscurridas.toFixed(1)} h with no reference price so far, and ${corridasDentro} run${
              corridasDentro === 1 ? '' : 's'
            } inside it.${
              horasFaltan !== null
                ? ` ${horasFaltan.toFixed(1)} h to go before the bell.`
                : ' The next session is not published yet, so the stretch runs off the edge rather than guessing an end.'
            } The desk is hatched over that same stretch, to scale.`
          : abierto
            ? 'Wall Street is open. Both prices move at once, so the gap is indicative.'
            : 'No reference price yet.'}
      </p>
    </div>
  )
}

/**
 * La forma del gap de un ticker en las últimas 24 h.
 *
 * La página afirma que el valor está en el archivo y no mostraba ni una serie.
 * Esto es esa afirmación hecha visible, fila por fila.
 *
 * Se dibuja POR INSTANTE y no por índice: con corridas faltantes, espaciar los
 * puntos por igual inventaría una continuidad que no hubo.
 */
export function Spark({
  serie,
  now,
  ancho = 72,
  alto = 18,
}: {
  serie: SeriePunto[]
  now: number
  /** Caja del dibujo. La fila del tablero es apaisada; el visor del aparato
      que sostiene la analista es casi cuadrado, y estirar un viewBox de 4:1
      dentro de una caja 1:1 exageraria la forma del dato. */
  ancho?: number
  alto?: number
}) {
  const puntos = serie.filter((p) => p.t >= now - VENTANA)
  if (puntos.length === 0) return null

  const W = ancho
  const H = alto
  const P = 2

  // Escala vertical simétrica alrededor de cero: el signo del gap importa, así
  // que el cero tiene que quedar SIEMPRE en el medio y no flotar con los datos.
  const mag = Math.max(0.05, ...puntos.map((p) => Math.abs(p.g)))
  const y = (g: number) => H / 2 - (g / mag) * (H / 2 - P)
  const x = (t: number) => P + ((t - (now - VENTANA)) / VENTANA) * (W - P * 2)

  const d = puntos
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.t).toFixed(1)} ${y(p.g).toFixed(1)}`)
    .join(' ')

  // Con dos o tres lecturas no hay una FORMA, hay lecturas sueltas. Unirlas con
  // una línea a través de 22 h vacías dibujaría una tendencia que nadie midió,
  // así que hasta MIN_FORMA sólo se marcan los puntos donde realmente cayeron.
  const MIN_FORMA = 4
  const hayForma = puntos.length >= MIN_FORMA

  return (
    <svg
      className="spark"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Gap over the last 24 hours, ${puntos.length} reading${puntos.length === 1 ? '' : 's'}`}
    >
      <line className="sparkZero" x1="0" y1={H / 2} x2={W} y2={H / 2} />
      {hayForma ? <path className="sparkLine" d={d} /> : null}
      {(hayForma ? [puntos[puntos.length - 1]] : puntos).map((p) => (
        <rect
          key={p.t}
          className="sparkDot"
          x={x(p.t) - 1.5}
          y={y(p.g) - 1.5}
          width="3"
          height="3"
        />
      ))}
    </svg>
  )
}
