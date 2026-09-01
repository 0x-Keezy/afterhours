import type { ReactNode } from 'react'
import { POLL_INTERVAL_SEC } from '../core/archive'
import type { PaperPhase } from '../core/session'
import { MIN_SAMPLES } from '../core/gap'
import { DayClock, Spark } from './instruments'
import { Countdown, FreshDot } from './live'
import { getPageState } from './state'

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

/**
 * Panel del escritorio. Los tres botones de la barra son decorativos: van con
 * aria-hidden para que no se anuncien como controles que no existen.
 */
function Win({
  title,
  className,
  stale,
  children,
}: {
  title: string
  className: string
  stale?: boolean
  children: ReactNode
}) {
  return (
    <section className={`win ${className}${stale ? ' stale' : ''}`}>
      <header>
        <h2>{title}</h2>
        <span className="boxes" aria-hidden="true">
          <i className="bMin" />
          <i className="bMax" />
          <i className="bClose" />
        </span>
      </header>
      <div className="body">{children}</div>
    </section>
  )
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
  const maxGap = board.rows.reduce((m, r) => Math.max(m, Math.abs(r.gapPct)), 0)
  const anchoBarra = (g: number) => (maxGap > 0 ? Math.sqrt(Math.abs(g) / maxGap) * 100 : 0)
  const ranking = [...board.rows]
    .sort((a, b) => Math.abs(b.gapPct) - Math.abs(a.gapPct))
    .slice(0, DESTACADAS)
    .map((r) => r.symbol)

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

  // El censo trae el nombre legible de cada acción y la página nunca lo mostró:
  // el tablero dice NVDA y nadie dice que eso es NVIDIA. Se cruza por símbolo.
  const nombrePorSimbolo = new Map(
    (universe?.entries ?? []).map((e) => [e.symbol, e.name.replace(' • Robinhood Token', '')]),
  )
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
            respira en vez de deslizarse. */}
        <div
          className="sprite"
          role="img"
          aria-label="The night-shift analyst, holding a terminal with a live chart."
        />
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

        {market !== null && !abierto ? (
          market.hoursUntilOpen !== null && session ? (
            <Countdown targetSec={session.start} label="OPENS IN" />
          ) : (
            <span className="sub">NEXT OPEN UNKNOWN</span>
          )
        ) : null}

        {abierto ? <span className="sub">GAP IS INDICATIVE WHILE BOTH SIDES MOVE.</span> : null}

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
          <dt>Today</dt>
          <dd>{runs.length}</dd>
          <dt>Phase</dt>
          <dd>{phase.toUpperCase()}</dd>
        </dl>
      </Win>

      <Win title="The board" className="wBoard">
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
                      <td className="sym">{r.symbol}</td>
                      <td className="num gapCell">
                        <span className="barTrack" aria-hidden="true">
                          <span
                            className="bar"
                            style={{ width: `${anchoBarra(r.gapPct).toFixed(2)}%` }}
                          />
                        </span>
                        <span className="gapNum">{r.gapPct.toFixed(2)} %</span>
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
              Bar length is the square root of the gap, against the widest one on the board,{' '}
              {maxGap.toFixed(2)} %. Square root because one outlier would flatten every other bar
              to nothing.
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
        <dl className="card">
          <dt>Shift</dt>
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
      <Win title="The census" className="wCensus">
        <div className="censusWrap">
          <ul className="census">
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
                <i key={i} data-run={hubo ? 'true' : undefined} />
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
            <dd>Every {Math.round(POLL_INTERVAL_SEC / 60)} minutes, committed to the repo</dd>
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
