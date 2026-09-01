import type { ReactNode } from 'react'
import { POLL_INTERVAL_SEC } from '../core/archive'
import { MIN_SAMPLES } from '../core/gap'
import { getPageState } from './state'

export const revalidate = 60

/** Cuántas filas se destacan en tinta plena para que la anomalía se vea sin leer 34 números. */
const DESTACADAS = 3
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
 * Panel del escritorio. Los tres botones de la barra son decorativos: van con
 * aria-hidden para que no se anuncien como controles que no existen.
 */
function Win({
  title,
  className,
  children,
}: {
  title: string
  className: string
  children: ReactNode
}) {
  return (
    <section className={`win ${className}`}>
      <header>
        <h2>{title}</h2>
        <span className="boxes" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </header>
      <div className="body">{children}</div>
    </section>
  )
}

export default async function Page() {
  const { now, phase, market, tz, board, archive, universe, runs } = await getPageState()

  const abierto = market?.status === 'open'

  // La barra se escala contra el mayor gap del tablero y la escala se declara
  // al pie: sin eso, una barra es decoración. Con eso, es el dato.
  const maxGap = board.rows.reduce((m, r) => Math.max(m, Math.abs(r.gapPct)), 0)
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

  return (
    <main className="desk">
      <Win title="The night shift" className="wShift">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="figure"
          src="/pixel/analyst.png"
          width={1024}
          height={1024}
          alt="The night-shift analyst, holding a terminal with a live chart."
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
          <span className="sub">
            {market.hoursUntilOpen !== null
              ? `OPENS IN ${horas(market.hoursUntilOpen)}`
              : 'NEXT OPEN UNKNOWN'}
          </span>
        ) : null}

        {abierto ? <span className="sub">GAP IS INDICATIVE WHILE BOTH SIDES MOVE.</span> : null}

        {tz ? (
          <span className="where">
            {reloj(now, tz)} {tz.split('/')[1]?.replace('_', ' ').toUpperCase()}
          </span>
        ) : null}
      </Win>

      <Win title="The board" className="wBoard">
        {board.rows.length === 0 ? (
          <p className="prose">NOTHING ARCHIVED YET.</p>
        ) : (
          <>
            {/* Una línea, en vez de repetir CALIBRATING en 34 filas idénticas. */}
            {calibrando ? (
              <p className="note">
                No ticker has a band yet. A band needs about {diasParaBanda} days of readings.
                Until then the board is ordered by liquidity, and it switches to anomaly order on
                its own.
              </p>
            ) : null}

            <div className="boardWrap">
              <table className="board">
                <thead>
                  <tr>
                    <th scope="col">Ticker</th>
                    <th scope="col" className="num">
                      Gap
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
                        <span
                          className="bar"
                          style={{
                            width: maxGap > 0 ? `${(Math.abs(r.gapPct) / maxGap) * 100}%` : '0%',
                          }}
                          aria-hidden="true"
                        />
                        <span className="gapNum">{r.gapPct.toFixed(2)} %</span>
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
              Bars are scaled against the largest gap on the board, {maxGap.toFixed(2)} %.
            </p>
          </>
        )}
      </Win>

      <Win title="Meet the analyst" className="wCard">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="figure"
          src="/pixel/portrait.png"
          width={1024}
          height={1024}
          alt="Portrait of the night-shift analyst."
        />
        <dl className="card" style={{ marginTop: '0.8rem' }}>
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
        {universe ? (
          <p className="prose">
            The census knows {universe.entries.length} tokenized stocks
            {universe.complete ? '' : ' so far'} and watches {board.rows.length}. The rest have no
            USDG pair or sit below the liquidity floor, so there is nothing to compare. The filter
            matches the exact token name, which keeps out the memecoins wearing the Robinhood
            label.
          </p>
        ) : null}
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
                  : `${archive.gaps.length} gap${archive.gaps.length === 1 ? '' : 's'}, shown rather than smoothed over.`}
            </p>
          </>
        )}
      </Win>

      <p className="foot">Nobody told her she could go home.</p>
    </main>
  )
}
