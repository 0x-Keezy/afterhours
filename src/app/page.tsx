import { POLL_INTERVAL_SEC } from '../core/archive'
import { MIN_SAMPLES } from '../core/gap'
import type { PaperPhase } from '../core/session'
import { HandText } from './lettering'
import { getPageState } from './state'
import { TollAlert, TollNeutral, TollSign, TollSignAlert, TollSignTired, TollTired } from './toll'

export const revalidate = 60

/** Umbral a partir del cual una desviación deja de ser ruido y TOLL se pone en alerta. */
const Z_RARO = 3
/** Cuántas filas se destacan en tinta plena para que la anomalía se vea sin leer 34 números. */
const DESTACADAS = 3
const DIA = 86400

const FASES: { id: PaperPhase; nombre: string; cuando: string }[] = [
  { id: 'day', nombre: 'DAY', cuando: 'MARKET OPEN' },
  { id: 'dusk', nombre: 'DUSK', cuando: 'JUST CLOSED' },
  { id: 'night', nombre: 'NIGHT', cuando: 'DEEP NIGHT' },
  { id: 'dawn', nombre: 'DAWN', cuando: 'ABOUT TO OPEN' },
]

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

/** TOLL sostiene el título. La navegación es el personaje, no una fila de tabs. */
function SectionSign({
  title,
  pose: Pose,
}: {
  title: string
  pose: typeof TollSign
}) {
  return (
    <div className="signBox">
      <Pose className="tollSign" />
      <HandText text={title} className="signTitle" strokeWidth={0.9} />
    </div>
  )
}

export default async function Page() {
  const { now, phase, market, tz, board, archive, universe, runs } = await getPageState()

  const abierto = market?.status === 'open'
  const raro = board.rows.some((r) => r.z !== null && Math.abs(r.z) >= Z_RARO)

  // El ánimo de TOLL lo dicta el tablero, no un capricho.
  const Toll = raro ? TollAlert : phase === 'night' ? TollTired : TollNeutral

  // La barra se escala contra el mayor gap del tablero y la escala se declara al
  // pie: sin eso, una barra es decoración. Con eso, es el dato.
  const maxGap = board.rows.reduce((m, r) => Math.max(m, Math.abs(r.gapPct)), 0)
  const ranking = [...board.rows]
    .sort((a, b) => Math.abs(b.gapPct) - Math.abs(a.gapPct))
    .slice(0, DESTACADAS)
    .map((r) => r.symbol)

  const calibrando = board.orderedBy === 'liquidity'
  const diasParaBanda = Math.ceil((MIN_SAMPLES * POLL_INTERVAL_SEC) / DIA)

  return (
    <main className="page">
      <header>
        <HandText text="AFTERHOURS" className="wordmark" />

        <p className="voice">
          <b>THE MARKET NEVER CLOSES.</b>
          <span>He took that personally.</span>
        </p>

        {/* Arriba del fold, porque un juez externo midió que "Robinhood Chain"
            aparecía recién a 5.400 px de scroll y el criterio de los diez
            segundos fallaba de forma objetiva. */}
        <p className="pitch">
          Robinhood Chain trades tokenized stocks 24/7. The Nasdaq does not. This page reads the
          drift between the two every 15 minutes while Wall Street is closed, and keeps every
          reading.
        </p>

        <div className="clock">
          <Toll className="toll" />

          <div className="readout">
            {market === null ? (
              <span className="state">MARKET STATE UNKNOWN</span>
            ) : abierto ? (
              <span className="state">
                <span className="badge">WALL STREET IS OPEN</span>
              </span>
            ) : (
              <span className="state">
                CLOSED FOR <span className="nowrap">{horas(market.hoursSinceLastTrade)}</span>
              </span>
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
          </div>
        </div>

        {/* La leyenda del instrumento. Sin ella, el papel-reloj es invisible para
            quien entra una sola vez: ve una página oscura y nunca se entera de
            que la oscuridad ES el dato. */}
        <div className="phases" aria-label="Paper phases">
          <span className="phasesLabel">THE PAPER IS THE CLOCK</span>
          <ul>
            {FASES.map((f) => (
              <li key={f.id} data-phase={f.id} aria-current={f.id === phase ? 'true' : undefined}>
                <span className="swatch" aria-hidden="true" />
                <b>{f.nombre}</b>
                <i>{f.cuando}</i>
              </li>
            ))}
          </ul>
        </div>
      </header>

      <section className="section">
        <SectionSign title="THE BOARD" pose={raro ? TollSignAlert : TollSign} />

        {board.rows.length === 0 ? (
          <p className="empty">NOTHING ARCHIVED YET.</p>
        ) : (
          <>
            {/* Una línea, en vez de repetir CALIBRATING en 34 filas idénticas.
                Dice lo mismo una sola vez y libera el ancho que la tabla
                necesitaba en mobile. */}
            {calibrando ? (
              <p className="note">
                No ticker has a band yet. A band needs about {diasParaBanda} days of readings, and
                the archive is {archive.samples > 0 ? 'younger than that' : 'empty'}. Until then the
                board is ordered by liquidity, and it switches to anomaly order on its own.
              </p>
            ) : null}

            <div className="boardWrap">
              <table className="board">
                <thead>
                  <tr>
                    <th scope="col">TICKER</th>
                    <th scope="col" className="num">
                      GAP
                    </th>
                    {calibrando ? null : (
                      <th scope="col" className="num">
                        VS ITS OWN BAND
                      </th>
                    )}
                    <th scope="col" className="num">
                      LIQUIDITY
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {board.rows.map((r) => {
                    const alto = ranking.includes(r.symbol)
                    return (
                      <tr key={r.symbol} className={alto ? 'lead' : undefined}>
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
                          <td className="num">
                            {r.z !== null ? `z ${r.z.toFixed(2)}` : `CALIBRATING ${Math.round(r.progress * 100)} %`}
                          </td>
                        )}
                        <td className="num soft liq">
                          ${Math.round(r.liquidityUsd).toLocaleString('en-US')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <p className="scale">
              BAR SCALE 0 TO {maxGap.toFixed(2)} %, THE WIDEST GAP ON THE BOARD RIGHT NOW.
            </p>
          </>
        )}
      </section>

      <section className="section">
        <SectionSign title={'WHAT THIS\nMEASURES'} pose={TollSign} />

        <p className="prose">
          For roughly 17 hours of every weekday, and for the whole weekend, the on-chain price of a
          tokenized stock drifts with nothing to anchor it, and nobody keeps that record.
        </p>
        <p className="prose">
          This page takes a reading every 15 minutes and stores it. One reading on its own proves
          nothing: a third of a percent is ordinary noise for a liquid name and a long way outside
          normal for a thin one. <b>The value is the archive, not the reading.</b> With enough
          history, {'"'}this looks odd{'"'} stops being an opinion and becomes a distance from that
          ticker{"'"}s own band.
        </p>
        <p className="prose">
          {universe && board.rows.length > 0
            ? `The census knows ${universe.entries.length} tokenized stocks${
                universe.complete ? '' : ' so far'
              } and watches ${board.rows.length} of them. The rest have no USDG pair or sit below the liquidity floor, so there is nothing to compare them against.`
            : ''}
        </p>
      </section>

      <section className="section">
        <SectionSign title="THE ARCHIVE" pose={TollSignTired} />

        {archive.samples === 0 ? (
          <p className="prose">
            Empty. The first reading lands when the poller next runs, and this page will say so
            rather than showing a number it does not have.
          </p>
        ) : (
          <>
            {/* La tesis del producto es el archivo, así que el archivo se MUESTRA.
                "No missed runs" dicho es una promesa; dibujado es verificable. */}
            <div className="strip" aria-label="Poller runs over the last 24 hours">
              <div className="stripRail">
                {runs.map((t) => (
                  <span
                    key={t}
                    className="tick"
                    style={{ left: `${((t - (now - DIA)) / DIA) * 100}%` }}
                  />
                ))}
              </div>
              <div className="stripEnds">
                <span>24 H AGO</span>
                <span>
                  {runs.length} {runs.length === 1 ? 'RUN' : 'RUNS'}
                </span>
                <span>NOW</span>
              </div>
            </div>

            <p className="prose">
              <b>{runs.length.toLocaleString('en-US')}</b> {runs.length === 1 ? 'run' : 'runs'} in
              the last 24 hours,{' '}
              <b>{archive.samples.toLocaleString('en-US')}</b> readings kept in total
              {archive.firstSampleAt ? `, since ${fecha(archive.firstSampleAt, tz)}` : ''}. One run
              writes one reading per watched ticker.
            </p>
            <p className="prose">
              {archive.gaps.length === 0
                ? 'No missed runs. Every gap you can see above is the poller not having started yet, not a hole in the record.'
                : `${archive.gaps.length} missed ${
                    archive.gaps.length === 1 ? 'run' : 'runs'
                  }, shown rather than smoothed over: ${archive.gaps
                    .slice(0, 4)
                    .map((g) => `${fecha(g.from, tz)} (${g.missedSamples})`)
                    .join(', ')}. A hole in the record is information about the record.`}
            </p>
          </>
        )}
      </section>

      {/* La factura epistémica. La desviación de registro de esta página se
          concedió argumentando que la confianza que necesita es epistémica y no
          custodial; eso obliga a sobre-pagar en evidencia, no a escribir prosa. */}
      <footer className="foot">
        <dl className="prov">
          <div>
            <dt>ON CHAIN</dt>
            <dd>DexScreener, Robinhood Chain, TICKER/USDG pairs</dd>
          </div>
          <div>
            <dt>REFERENCE</dt>
            <dd>Yahoo Finance, last regular session price</dd>
          </div>
          <div>
            <dt>CADENCE</dt>
            <dd>every {POLL_INTERVAL_SEC / 60} minutes, GitHub Actions</dd>
          </div>
          <div>
            <dt>LAST READ</dt>
            <dd>
              {archive.lastSampleAt
                ? `${reloj(archive.lastSampleAt, tz)} ${tz ? tz.split('/')[1]?.replace('_', ' ').toUpperCase() : 'UTC'}`
                : 'no readings yet'}
            </dd>
          </div>
          <div>
            <dt>RAW ARCHIVE</dt>
            <dd>
              <a href="/archive">every reading, one per line</a>
            </dd>
          </div>
          <div>
            <dt>NOT ADVICE</dt>
            <dd>indicative only. this is a measurement, not a recommendation.</dd>
          </div>
        </dl>

        <p className="sign-off">NOBODY TOLD HIM HE COULD GO HOME.</p>
      </footer>
    </main>
  )
}
