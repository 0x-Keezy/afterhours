import { POLL_INTERVAL_SEC } from '../core/archive'
import type { PaperPhase } from '../core/session'
import { MIN_SAMPLES } from '../core/gap'
import { DayClock, Spark } from './instruments'
import { Countdown, Elapsed, FreshDot, GapNum, NextReading } from './live'
import { getPageState } from './state'
import { Street, resumenFachada, type Ranura } from './street'
import { Win } from './win'

export const revalidate = 60

/** Cuántas filas se destacan en tinta plena para que la anomalía se vea sin leer 34 números. */
const DESTACADAS = 3

/**
 * Qué está haciendo la analista en cada fase. Sale del retrato que le
 * corresponde, así que el texto y el dibujo no pueden desincronizarse.
 */
const ANIMO: Record<PaperPhase, string> = {
  day: 'The bell rang and she is awake for it.',
  dusk: 'The floor emptied out. She stayed.',
  night: 'Deep night, lit by the screen.',
  dawn: 'Coffee, and the bell is close.',
}
const DIA = 86400
/** Filas del censo que entran sin cortar; el resto se recorre solo. */
const FILAS_CENSO_VISIBLES = 9

function horas(n: number) {
  return `${n.toFixed(1)} H`
}

function fecha(tSec: number, tz: string | null) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz ?? 'UTC',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(new Date(tSec * 1000))
}

function reloj(tSec: number, tz: string | null) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz ?? 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(tSec * 1000))
}

/**
 * Cuánto hace de un instante, redondeado a la unidad que la página puede
 * sostener. La página se regenera cada 60 s (revalidate), así que el minuto es
 * la resolución honesta: no se muestran segundos.
 */
function haceCuanto(tSec: number, nowSec: number): string {
  const min = Math.max(0, Math.round((nowSec - tSec) / 60))
  if (min < 1) return 'JUST NOW'
  if (min < 60) return `${min} MIN AGO`
  const h = Math.floor(min / 60)
  const resto = min % 60
  return resto === 0 ? `${h} H AGO` : `${h} H ${resto} MIN AGO`
}

export default async function Page() {
  const { now, phase, market, tz, session, board, archive, universe, runs } = await getPageState()

  const abierto = market?.status === 'open'

  // La barra se escala contra el mayor gap del tablero y la escala se declara
  // al pie: sin eso, una barra es decoración. Con eso, es el dato.
  //
  // RAÍZ CUADRADA, no lineal. Medido en producción: con un outlier de 38 % las
  // demás barras salían de 1, 6 y 7 px de ancho, o sea que la columna estaba
  // muerta en 32 de 34 filas. La raíz reparte el rango donde están los datos.
  // LA ESCALA ES EL NOVENO DECIL, NO EL MAXIMO. Medido en produccion con 41
  // filas: mediana 0,41 %, noveno decil 6,64 % y un maximo de 185,42 % (SNAP,
  // con 66 mil dolares de liquidez: eso no es deriva, es una punta parada).
  // Contra el maximo, 23 de 41 barras median menos del 3 % de la pista, o sea
  // menos de 6 px: mas de media columna muerta. La raiz cuadrada ya estaba y no
  // alcanza — baja el exponente, no salva un rango de 450:1.
  //
  // Las que se pasan de la escala NO se recortan en silencio: se topan al final
  // de su media pista y se marcan con un tope solido, y la nota al pie declara
  // cuantas son. Una barra que miente por recorte seria peor que una chica.
  const magnitudes = board.rows.map((r) => Math.abs(r.gapPct)).sort((a, b) => a - b)
  const escala =
    magnitudes.length === 0
      ? 0
      : Math.max(0.05, magnitudes[Math.min(magnitudes.length - 1, Math.floor(magnitudes.length * 0.9))])
  // Crece desde el eje central, asi que ocupa como maximo la mitad de la pista.
  const anchoBarra = (g: number) =>
    escala > 0 ? Math.min(1, Math.sqrt(Math.abs(g) / escala)) * 50 : 0
  const desborda = (g: number) => escala > 0 && Math.abs(g) > escala
  const desbordadas = board.rows.filter((r) => desborda(r.gapPct)).length
  const porAnomalia = [...board.rows].sort((a, b) => Math.abs(b.gapPct) - Math.abs(a.gapPct))
  const ranking = porAnomalia.slice(0, DESTACADAS).map((r) => r.symbol)
  /** El ticker mas anomalo: el que va en el visor que ella sostiene. */
  const lider = porAnomalia[0] ?? null

  const calibrando = board.orderedBy === 'liquidity'
  const diasParaBanda = Math.ceil((MIN_SAMPLES * POLL_INTERVAL_SEC) / DIA)
  const esperadas = Math.round(DIA / POLL_INTERVAL_SEC)

  // Una ranura por corrida programada; se marca la que efectivamente ocurrió.
  const ranuras = Array.from({ length: esperadas }, (_, i) => {
    const desde = now - DIA + i * POLL_INTERVAL_SEC
    return runs.some((t) => t >= desde && t < desde + POLL_INTERVAL_SEC)
  })

  // Con el archivo recién empezado, "no missed runs" sería engañoso: 95 de las
  // 96 ranuras no ocurrieron porque el poller todavía no existía.
  const arrancoHoy = archive.firstSampleAt !== null && archive.firstSampleAt > now - DIA

  // La ranura mas nueva que efectivamente ocurrio; late sólo si el dato es fresco.
  const ultimaRanura = ranuras.reduce((ult, hubo, i) => (hubo ? i : ult), -1)

  // La frescura es el titular de un instrumento. Si la ultima lectura es mas
  // vieja que dos cadencias, el panel NO puede verse igual que uno fresco: la
  // pagina se estaria contradiciendo a si misma en el primer viewport.
  const rancio =
    archive.lastSampleAt !== null && now - archive.lastSampleAt > 2 * POLL_INTERVAL_SEC
  const perdidas =
    archive.lastSampleAt === null
      ? 0
      : Math.max(0, Math.floor((now - archive.lastSampleAt) / POLL_INTERVAL_SEC) - 1)

  // El avance de calibración del ticker más adelantado. Es el que decide cuándo
  // el tablero deja de ordenar por liquidez, así que es el número que importa.
  const avance = board.rows.reduce((m, r) => Math.max(m, r.progress), 0)

  // El tramo cerrado en curso arranca en el último trade REAL, que es lo que la
  // fuente mide. Es el mismo instante con el que el reloj de 24 h pinta la
  // banda rayada, así que la fachada y el reloj no pueden contradecirse.
  const ultimoTrade =
    market === null ? null : now - market.hoursSinceLastTrade * 3600
  // Una entrada por CORRIDA PROGRAMADA del tramo cerrado, marcada si ocurrio.
  // La unidad es la ranura y no la lectura: contar lecturas sobre las 159
  // ventanas del dibujo daba un denominador imposible (una noche de semana son
  // 68 corridas, asi que el edificio nunca podia pasar del 43 % con la noche
  // entera cumplida). Ademas asi las corridas perdidas quedan a oscuras: los
  // huecos del archivo se ven en el edificio en vez de quedar en una nota.
  //
  // El origen se corta en las ultimas 24 h porque es lo unico sobre lo que
  // `runs` puede testificar: dibujar ranuras mas viejas inventaria huecos.
  const arranqueTramo = ultimoTrade === null ? null : Math.max(ultimoTrade, now - DIA)
  /** El tramo es mas viejo que lo que `runs` puede testificar: la cuenta no
      puede decir "desde la campana" sin mentir. */
  const tramoAcotado = ultimoTrade !== null && ultimoTrade < now - DIA
  // Las ranuras se anclan a la GRILLA DE CADENCIA, no al instante del ultimo
  // trade. Anclarlas a ese instante —arbitrario, lo publica la fuente— y
  // redondear con `floor` hacia que la lectura MAS RECIENTE nunca pudiera
  // encender su ventana: medido en produccion, el panel decia 0 de 1 encendida
  // con una lectura de hace cuatro minutos en el panel de al lado.
  const baseTramo =
    arranqueTramo === null
      ? null
      : Math.floor(arranqueTramo / POLL_INTERVAL_SEC) * POLL_INTERVAL_SEC
  const ranurasTramo: Ranura[] =
    baseTramo === null
      ? []
      : Array.from(
          { length: Math.max(0, Math.ceil((now - baseTramo) / POLL_INTERVAL_SEC)) },
          (_, i) => {
            const desde = baseTramo + i * POLL_INTERVAL_SEC
            if (runs.some((t) => t >= desde && t < desde + POLL_INTERVAL_SEC)) return 'ok'
            // La ranura en curso todavia no vencio: no puede estar perdida.
            return desde + POLL_INTERVAL_SEC > now ? 'pendiente' : 'perdida'
          },
        )
  const fachada = resumenFachada({
    abierto,
    ranuras: ranurasTramo,
    desconocido: market === null,
  })

  // El censo trae el nombre legible de cada acción y la página nunca lo mostró:
  // el tablero dice NVDA y nadie dice que eso es NVIDIA. Se cruza por símbolo.
  const nombrePorSimbolo = new Map(
    (universe?.entries ?? []).map((e) => [e.symbol, e.name.replace(' • Robinhood Token', '')]),
  )
  // La direccion del token, para que cada ticker sea verificable en la chain.
  const dirPorSimbolo = new Map((universe?.entries ?? []).map((e) => [e.symbol, e.address]))
  const vigilados = board.rows.map((r) => ({
    symbol: r.symbol,
    nombre: nombrePorSimbolo.get(r.symbol) ?? null,
  }))
  const excluidos = universe ? Math.max(0, universe.entries.length - board.rows.length) : null

  return (
    <main className="desk">
      <Win title="The night shift" className="wShift">
        {/* Hoja de sprites, no GIF: un GIF sacado de video interpola y destruye
            la grilla de pixeles. Cuatro cuadros anclados por los pies, asi que
            respira en vez de deslizarse.

            EL VISOR QUE SOSTIENE ES UN DATO, NO UN DIBUJO. Era el panel mas
            grande de la pagina y el unico sin una sola cifra, con un grafico
            HORNEADO en la hoja: un display falso adentro de un instrumento.
            Ahora dibuja la serie del ticker mas anomalo del tablero, el mismo
            que el tablero marca con la muesca al margen. La caja del visor
            (105,223)-(143,263) de una celda de 256x640 esta MEDIDA sobre la
            hoja: es exactamente lo que cambia entre el cuadro 0 y el 3, o sea
            el grafico que este reemplaza. */}
        <div
          className="sprite"
          role="img"
          aria-label={
            lider
              ? `The night-shift analyst, holding a terminal that plots ${lider.symbol}, the widest gap on the board right now.`
              : 'The night-shift analyst, holding a terminal.'
          }
        >
          {lider ? (
            <span className="sprScreen" aria-hidden="true">
              <Spark serie={lider.serie} now={now} ancho={39} alto={41} />
            </span>
          ) : null}
        </div>
      </Win>

      <Win title="The clock" className="wClock">
        <h1 className="wordmark">AFTERHOURS</h1>
        <p className="voice">The market never closes. Somebody has to sit with it.</p>

        {market === null ? (
          <span className="state">MARKET STATE UNKNOWN</span>
        ) : abierto ? (
          <span className="state">
            <span className="badge">WALL STREET IS OPEN</span>
          </span>
        ) : (
          <span className="state">CLOSED FOR {horas(market.hoursSinceLastTrade)}</span>
        )}

        {/* El reloj tiene que ANDAR en los cuatro estados. Antes sólo contaba
            en la ventana previa a la campana: con el mercado abierto no había
            número vivo, y después del cierre `hoursUntilOpen` es null, así que
            la página pasaba la noche entera —su propio sujeto— con un reloj
            quieto que decía NEXT OPEN UNKNOWN.
            Cada rama cuenta contra un instante MEDIDO, ninguno reconstruido. */}
        {market !== null && !abierto ? (
          market.hoursUntilOpen !== null && session ? (
            <Countdown targetSec={session.start} nowSec={now} label="OPENS IN" />
          ) : ultimoTrade !== null ? (
            <>
              <Elapsed fromSec={ultimoTrade} nowSec={now} label="SINCE THE BELL" />
              <span className="sub">NEXT OPEN UNKNOWN</span>
            </>
          ) : (
            <span className="sub">NEXT OPEN UNKNOWN</span>
          )
        ) : null}

        {abierto ? (
          <>
            {session ? <Countdown targetSec={session.end} nowSec={now} label="CLOSES IN" /> : null}
            <span className="sub">GAP IS INDICATIVE WHILE BOTH SIDES MOVE.</span>
          </>
        ) : null}

        {tz ? (
          <span className="where">
            {reloj(now, tz)} {tz.split('/')[1]?.replace('_', ' ').toUpperCase()}
          </span>
        ) : null}

        {/* El día entero de un vistazo: cuánto tiempo lleva sin precio de
            referencia, dónde suena la campana, y en qué instantes se leyó. */}
        <DayClock
          now={now}
          session={session}
          runs={runs}
          hoursSinceLastTrade={market ? market.hoursSinceLastTrade : null}
          abierto={abierto}
        />
      </Win>

      {/* La frescura era el hueco más grave: la página decía DESDE cuándo
          archiva y nunca CUÁNDO leyó por última vez. Sin eso parece un informe
          viejo en vez de un instrumento vivo. Todo sale de archive.lastSampleAt
          y de session, que ya estaban cargados y se tiraban. */}
      <Win title="Last reading" className="wPulse" stale={rancio}>
        {archive.lastSampleAt === null ? (
          <span className="pulseBig">NEVER</span>
        ) : (
          <>
            <span className="pulseBig">
              <FreshDot lastSec={archive.lastSampleAt} ventanaSec={POLL_INTERVAL_SEC * 2} />
              {haceCuanto(archive.lastSampleAt, now)}
            </span>
            <span className="sub">
              {reloj(archive.lastSampleAt, tz)}{' '}
              {tz ? tz.split('/')[1]?.replace('_', ' ').toUpperCase() : 'UTC'}
            </span>
            {/* La cuenta hasta la corrida siguiente, y el disparador del único
                movimiento que vale: al vencer, la página se pide de nuevo sola.
                Sin esto el resto de la pantalla es una foto hasta que alguien
                recargue, y el archivo puede estar horas por delante de lo que
                se ve. Cuando la corrida se atrasa, el mismo número cuenta al
                revés: la demora se ve mientras ocurre. */}
            <NextReading
              lastSec={archive.lastSampleAt}
              cadenciaSec={POLL_INTERVAL_SEC}
              nowSec={now}
            />
            {rancio ? (
              <span className="stalePill">
                STALE · {perdidas} SCHEDULED {perdidas === 1 ? 'RUN' : 'RUNS'} MISSED
              </span>
            ) : null}
          </>
        )}
        <dl className="card">
          <dt>Every</dt>
          <dd>{Math.round(POLL_INTERVAL_SEC / 60)} min</dd>
          <dt>Runs today</dt>
          <dd>{runs.length}</dd>
          <dt>Phase</dt>
          <dd>{phase.toUpperCase()}</dd>
        </dl>
      </Win>

      {/* LA FACHADA. Medido: entre el pie del reloj y el techo del tablero
          quedaba un rectángulo de escritorio desnudo de 1055 × 262 px, el
          hueco más grande de la página y casi un 10 % del lienzo. Acá va lo
          que ese hueco pedía: el edificio de enfrente, con una ventana
          encendida por lectura tomada desde la campana. */}
      <Win
        title="Outside"
        className="wStreet"
        count={
          market === null
            ? 'dark'
            : abierto
              ? 'all lit'
              : `${fachada.encendidas} / ${fachada.programadas} lit`
        }
      >
        <Street
          abierto={abierto}
          ranuras={ranurasTramo}
          desconocido={market === null}
          acotado={tramoAcotado}
        />
      </Win>

      <Win
        title="The board"
        className="wBoard"
        count={board.rows.length > 0 ? `${board.rows.length} watched` : undefined}
      >
        {board.rows.length === 0 ? (
          <p className="prose">NOTHING ARCHIVED YET.</p>
        ) : (
          <>
            {/* Una línea, en vez de repetir CALIBRATING en 34 filas idénticas.
                Con la barra de avance real: progress ya estaba calculado por
                ticker y no se dibujaba en ningún lado. */}
            {calibrando ? (
              <div className="calib">
                <p className="note" style={{ margin: 0 }}>
                  No ticker has a band yet. A band needs about {diasParaBanda} days of readings.
                  Until then the board is ordered by liquidity, and it switches to anomaly order on
                  its own.
                </p>
                <div className="calibBar" aria-hidden="true">
                  <span style={{ width: `${(avance * 100).toFixed(1)}%` }} />
                </div>
                <span className="calibNum">{Math.round(avance * 100)} % TO THE FIRST BAND</span>
              </div>
            ) : null}

            <div className="boardWrap">
              <table className="board">
                <thead>
                  <tr>
                    <th scope="col">Ticker</th>
                    <th scope="col" className="num">
                      Gap
                    </th>
                    <th scope="col" className="spk">
                      Last 24 h
                    </th>
                    {calibrando ? null : (
                      <th scope="col" className="num">
                        Vs its own band
                      </th>
                    )}
                    <th scope="col" className="num">
                      Liquidity
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {board.rows.map((r) => (
                    <tr key={r.symbol} className={ranking.includes(r.symbol) ? 'lead' : undefined}>
                      <td className="sym">
                        {dirPorSimbolo.has(r.symbol) ? (
                          <a
                            href={`https://dexscreener.com/robinhood/${dirPorSimbolo.get(r.symbol)}`}
                            rel="noreferrer noopener"
                            title={`${r.symbol} on chain`}
                          >
                            {r.symbol}
                          </a>
                        ) : (
                          r.symbol
                        )}
                      </td>
                      <td className="num gapCell">
                        <span className="barTrack" aria-hidden="true">
                          <span
                            className="bar"
                            data-signo={r.gapPct < 0 ? 'neg' : 'pos'}
                            data-desborda={desborda(r.gapPct) ? 'true' : undefined}
                            style={{ width: `${anchoBarra(r.gapPct).toFixed(2)}%` }}
                          />
                        </span>
                        {/* La celda recuerda su valor anterior: cuando llega
                            una lectura que lo cambia se marca sola. El tablero
                            es el panel más grande y era el único dato de la
                            página que se renovaba sin que se notara. */}
                        <GapNum
                          symbol={r.symbol}
                          value={r.gapPct}
                          texto={`${r.gapPct.toFixed(2)} %`}
                        />
                      </td>
                      <td className="spk">
                        <Spark serie={r.serie} now={now} />
                      </td>
                      {calibrando ? null : (
                        <td className="num">{r.z === null ? '—' : `z ${r.z.toFixed(2)}`}</td>
                      )}
                      <td className="num">${Math.round(r.liquidityUsd).toLocaleString('en-US')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="note" style={{ marginTop: '0.8rem', marginBottom: 0 }}>
              Bars grow from the centre line: a discount runs left, a premium runs right. Length
              is the square root of the gap against the ninth decile of the board,{' '}
              {escala.toFixed(2)} % — not against the widest, because one broken quote flattens
              every other bar to nothing.{' '}
              {desbordadas > 0
                ? `${desbordadas} row${desbordadas === 1 ? '' : 's'} run past that scale and stop with a solid cap; the number beside the bar is still the whole gap.`
                : 'No row runs past that scale today.'}
            </p>
          </>
        )}
      </Win>

      <Win title="Meet the analyst" className="wCard">
        <div className="who">
          {/* Una pose por fase del papel: el personaje deja de ser decoración y
              pasa a ser otra lectura del estado del mercado, igual que el papel.
              Los cuatro archivos comparten caja y tamaño, así que al cambiar de
              fase la imagen no salta. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="figure avatar"
            src={`/pixel/analyst-${phase}.png`}
            width={445}
            height={640}
            alt={ANIMO[phase]}
          />
          <p className="whoLine">
            {ANIMO[phase]} She reads {board.rows.length} tickers every{' '}
            {Math.round(POLL_INTERVAL_SEC / 60)} minutes and writes down what she sees. Nobody asked
            her to.
          </p>
        </div>
        {/* Este panel medía 0 px de movimiento y 0 elementos con los que se
            pudiera interactuar: era el único completamente inerte. Lo que le
            faltaba no era adorno, era el número que hace verdadera la última
            frase: cuánto lleva sosteniendo el archivo, corriendo. */}
        {archive.firstSampleAt !== null ? (
          <Elapsed fromSec={archive.firstSampleAt} nowSec={now} label="KEEPING THE RECORD FOR" />
        ) : null}
        <dl className="card">
          <dt>Night shift</dt>
          <dd>{abierto ? 'OFF' : 'ON'}</dd>
          <dt>Watching</dt>
          <dd>{board.rows.length}</dd>
          <dt>Known</dt>
          <dd>
            {universe ? universe.entries.length : '—'}
            {universe && !universe.complete ? '+' : ''}
          </dd>
          <dt>Readings</dt>
          <dd>{archive.samples.toLocaleString('en-US')}</dd>
        </dl>
      </Win>

      {/* El censo estaba entero en memoria y sólo se usaba `.length`. Acá se
          muestra QUÉ son los tickers del tablero: el tablero dice NVDA y hasta
          ahora nadie decía que eso es NVIDIA. */}
      <Win
        title="The census"
        className="wCensus"
        count={universe ? `${board.rows.length} / ${universe.entries.length}` : undefined}
      >
        {/* `tabIndex` no es decorativo: la lista se detiene con `:hover` y con
            `:focus-within`, y en tactil no hay hover — sin foco posible, en un
            telefono no habia NINGUNA forma de pararla (WCAG 2.2.2). Con esto,
            un toque la detiene. */}
        <div className="censusWrap" tabIndex={0}>
          {/* --filas y --recorrido gobiernan el desplazamiento: la duracion
              crece con la cantidad de filas y el viaje es exactamente lo que
              sobra por debajo del corte. */}
          <ul
            className="census"
            style={
              {
                '--filas': vigilados.length,
                '--recorrido': Math.max(0, vigilados.length - FILAS_CENSO_VISIBLES),
              } as React.CSSProperties
            }
          >
            {vigilados.map((v) => (
              <li key={v.symbol}>
                <b>{v.symbol}</b>
                <span>{v.nombre ?? '—'}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="note" style={{ marginTop: '0.7rem', marginBottom: 0 }}>
          {universe
            ? `${universe.entries.length} tokenized stocks known after scanning ${universe.pages} pages of the chain${universe.complete ? '' : ', and the scan has not reached the end yet'}. ${excluidos} are not watched: no USDG pair, or below the liquidity floor.`
            : 'Census not available.'}
        </p>
      </Win>

      <Win title="What this measures" className="wMeasure">
        <p className="prose">
          Robinhood Chain trades tokenized stocks around the clock. The Nasdaq does not. For
          roughly 17 hours of every weekday, and for the whole weekend, the on chain price drifts
          with nothing to anchor it, and nobody keeps that record.
        </p>
        <p className="prose">
          This page takes a reading every 15 minutes and stores it. One reading on its own proves
          nothing: a third of a percent is ordinary noise for a liquid name and a long way outside
          normal for a thin one. <b>The value is the archive, not the reading.</b>
        </p>
        <p className="prose">
          The filter matches the exact token name, which keeps out the memecoins wearing the
          Robinhood label.
        </p>
      </Win>

      <Win title="The archive" className="wArchive">
        {archive.samples === 0 ? (
          <p className="prose">
            Empty. The first reading lands when the poller next runs, and this page will say so
            rather than showing a number it does not have.
          </p>
        ) : (
          <>
            <p className="prose">
              <b>{archive.samples.toLocaleString('en-US')}</b> readings kept
              {archive.firstSampleAt ? `, since ${fecha(archive.firstSampleAt, tz)}` : ''}.
            </p>
            {/* Una ranura por corrida programada de las últimas 24 h. Las que
                no ocurrieron quedan huecas: así 1 de 96 se lee como 1 de 96 y
                no como una barra llena. */}
            <div className="runs" aria-hidden="true">
              {ranuras.map((hubo, i) => (
                <i
                  key={i}
                  data-run={hubo ? 'true' : undefined}
                  data-fresh={hubo && !rancio && i === ultimaRanura ? 'true' : undefined}
                />
              ))}
            </div>
            <p className="note" style={{ marginTop: '0.6rem', marginBottom: 0 }}>
              {runs.length} of {esperadas} scheduled runs in the last 24 hours.{' '}
              {arrancoHoy
                ? 'The archive started today, so most of the strip has not happened yet.'
                : archive.gaps.length === 0
                  ? 'No missed runs.'
                  : `${archive.gaps.length} gap${archive.gaps.length === 1 ? '' : 's'}, shown rather than smoothed over. The longest lost ${Math.max(...archive.gaps.map((g) => g.missedSamples))} readings.`}
            </p>
          </>
        )}
      </Win>

      {/* Un instrumento que no se puede verificar es un poster: la pagina no
          nombraba ninguna de las dos fuentes que compara, ni tenia un solo
          enlace. Todo lo de aca esta medido, no supuesto. */}
      <Win title="Sources" className="wSources">
        <dl className="sources">
          <div>
            <dt>On chain</dt>
            <dd>Uniswap v3 pools quoted in USDG, on Robinhood Chain (EVM 4663)</dd>
          </div>
          <div>
            <dt>Reference</dt>
            <dd>Yahoo Finance chart API, unofficial and it can stop without notice</dd>
          </div>
          <div>
            <dt>Census</dt>
            <dd>
              <a href="https://robinhoodchain.blockscout.com/tokens" rel="noreferrer noopener">
                Blockscout token list
              </a>
              , filtered by exact token name
            </dd>
          </div>
          <div>
            <dt>Cadence</dt>
            <dd>
              Every {Math.round(POLL_INTERVAL_SEC / 60)} minutes, committed to the repo. One{' '}
              <b>run</b> quotes every watched ticker; one <b>reading</b> is one ticker in one run.
            </dd>
          </div>
          <div>
            <dt>Archive</dt>
            <dd>
              <a href="https://github.com/0x-Keezy/afterhours/tree/main/data" rel="noreferrer noopener">
                Raw JSONL, one line per reading
              </a>
            </dd>
          </div>
          <div>
            <dt>Code</dt>
            <dd>
              <a href="https://github.com/0x-Keezy/afterhours" rel="noreferrer noopener">
                github.com/0x-Keezy/afterhours
              </a>
            </dd>
          </div>
        </dl>
      </Win>

      <p className="foot">Nobody told her she could go home.</p>
    </main>
  )
}
