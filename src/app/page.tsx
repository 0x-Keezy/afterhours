import { HandText } from './lettering'
import { getPageState } from './state'
import { TollAlert, TollNeutral, TollSign, TollTired } from './toll'

export const revalidate = 60

/** Umbral a partir del cual una desviación deja de ser ruido y TOLL se pone en alerta. */
const Z_RARO = 3

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

/** TOLL sostiene el título. La navegación es el personaje, no una fila de tabs. */
function SectionSign({ title }: { title: string }) {
  return (
    <div className="signBox">
      <TollSign className="tollSign" />
      <HandText text={title} className="signTitle" strokeWidth={0.9} />
    </div>
  )
}

export default async function Page() {
  const { now, phase, market, tz, board, archive, universe } = await getPageState()

  const abierto = market?.status === 'open'
  const raro = board.rows.some((r) => r.z !== null && Math.abs(r.z) >= Z_RARO)

  // El ánimo de TOLL lo dicta el tablero, no un capricho: una desviación rara
  // gana a la hora, y de noche sin nada raro está simplemente cansado.
  const Toll = raro ? TollAlert : phase === 'night' ? TollTired : TollNeutral

  const reloj = tz
    ? new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(now * 1000))
    : null

  return (
    <main className="page">
      <header>
        <HandText text="AFTERHOURS" className="wordmark" />

        <p className="voice">
          <b>THE MARKET NEVER CLOSES.</b>
          <span>He took that personally.</span>
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

            {reloj && tz ? (
              <span className="where">
                {reloj} {tz.split('/')[1]?.replace('_', ' ').toUpperCase()}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <section className="section">
        <SectionSign title="THE BOARD" />

        {board.rows.length === 0 ? (
          <p className="empty">NOTHING ARCHIVED YET.</p>
        ) : (
          <div className="boardWrap">
            <table className="board">
              <thead>
                <tr>
                  <th scope="col">TICKER</th>
                  <th scope="col" className="num">
                    GAP
                  </th>
                  <th scope="col" className="num">
                    VS ITS OWN BAND
                  </th>
                  <th scope="col" className="num">
                    LIQUIDITY
                  </th>
                </tr>
              </thead>
              <tbody>
                {board.rows.map((r) => (
                  <tr key={r.symbol}>
                    <td className="sym">{r.symbol}</td>
                    <td className="num">{r.gapPct.toFixed(2)} %</td>
                    <td className={r.calibrating ? 'num soft' : 'num'}>
                      {r.calibrating
                        ? `CALIBRATING ${Math.round(r.progress * 100)} %`
                        : `z ${r.z!.toFixed(2)}`}
                    </td>
                    <td className="num soft">
                      ${Math.round(r.liquidityUsd).toLocaleString('en-US')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="section">
        <SectionSign title={'WHAT THIS\nMEASURES'} />

        <p className="prose">
          Robinhood Chain trades tokenized stocks around the clock. The Nasdaq does not. For roughly
          17 hours of every weekday, and for the whole weekend, the on chain price drifts with
          nothing to anchor it, and nobody keeps that record.
        </p>
        <p className="prose">
          This page takes a reading every 15 minutes and stores it. One reading on its own proves
          nothing: a third of a percent is ordinary noise for a liquid name and a long way outside
          normal for a thin one. <b>The value is the archive, not the reading.</b> With enough
          history, {'"'}this looks odd{'"'} stops being an opinion and becomes a distance from that
          ticker{"'"}s own band.
        </p>
        <p className="prose">
          {board.orderedBy === 'anomaly'
            ? 'The board is ordered by anomaly, never by raw size. A ticker that sits 0.8 % off every single night is not news.'
            : 'The board is ordered by liquidity for now, because no ticker has enough history for a band yet. It switches to anomaly order the moment the first one does.'}
          {universe && board.rows.length > 0
            ? ` The census knows ${universe.entries.length} tokenized stocks${
                universe.complete ? '' : ' so far'
              }, and watches ${board.rows.length}. The rest have no USDG pair or sit below the liquidity floor, so there is nothing to compare.`
            : ''}
        </p>
      </section>

      <section className="section">
        <SectionSign title="THE ARCHIVE" />

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
            <p className="prose">
              {archive.gaps.length === 0
                ? 'No missed runs. Every scheduled reading is in the file.'
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

      <footer className="foot">
        NOBODY TOLD HIM HE COULD GO HOME.
      </footer>
    </main>
  )
}
