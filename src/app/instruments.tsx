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
}: {
  now: number
  session: { start: number; end: number } | null
  runs: number[]
  hoursSinceLastTrade: number | null
  abierto: boolean
}) {
  const desde = now - MEDIA
  const hasta = now + MEDIA

  const ultimoTrade = hoursSinceLastTrade === null ? null : now - hoursSinceLastTrade * HORA

  // El tramo cerrado: desde que dejó de haber trades reales hasta que suena la
  // campana. Es el sujeto del producto, así que es lo que más pesa en el dibujo.
  const cierraEn = ultimoTrade
  const abreEn = session ? session.start : null
  const mostrarCerrado =
    !abierto && cierraEn !== null && abreEn !== null && abreEn > cierraEn && cierraEn < hasta

  const horasCerrado = mostrarCerrado ? (abreEn! - cierraEn!) / HORA : null

  const enBanda = (t: number) => t >= desde && t <= hasta

  return (
    <div className="dayclock">
      <div className="dcTrack">
        {/* El tramo sin ancla. Lo que la página venía afirmando en palabras. */}
        {mostrarCerrado ? (
          <span
            className="dcClosed"
            style={{ left: pct(pos(cierraEn!, now)), right: pct(1 - pos(abreEn!, now)) }}
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
        {horasCerrado !== null
          ? `${horasCerrado.toFixed(1)} h with no reference price. ${runs.length} reading${
              runs.length === 1 ? '' : 's'
            } taken inside it.`
          : abierto
            ? 'Wall Street is open. Both prices move at once, so the gap is indicative.'
            : 'Next session unknown, so the closed stretch is not drawn.'}
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
export function Spark({ serie, now }: { serie: SeriePunto[]; now: number }) {
  const puntos = serie.filter((p) => p.t >= now - VENTANA)
  if (puntos.length === 0) return null

  const W = 72
  const H = 18
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
