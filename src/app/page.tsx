import { buildBoard } from '../core/board'
import { marketState, paperPhase, type PaperPhase } from '../core/session'
import type { MarketState } from '../core/types'
import { yahooEquitySource } from '../sources/equity'
import { readRecent } from '../store/jsonl'
import { readUniverse } from '../store/universe'

export const revalidate = 60

const DATA_DIR = 'data'

export default async function Page() {
  const now = Math.floor(Date.now() / 1000)
  const history = await readRecent(DATA_DIR, 14, now)
  const universo = await readUniverse(DATA_DIR)

  const ultimoT = history.reduce((max, s) => Math.max(max, s.t), 0)
  const latest = history.filter((s) => s.t === ultimoT)
  const board = buildBoard(history, latest, now)

  // El reloj se ancla en SPY si está; si no, en el primer símbolo con muestra.
  const ancla = latest.find((s) => s.symbol === 'SPY')?.symbol ?? latest[0]?.symbol
  let estado: MarketState | null = null
  let phase: PaperPhase = 'night'
  if (ancla) {
    try {
      const eq = await yahooEquitySource(fetch).quote(ancla)
      estado = marketState(eq.meta, now)
      phase = paperPhase(estado)
    } catch {
      estado = null // se declara desconocido en vez de inventarlo
    }
  }

  const abierto = estado?.status === 'open'

  return (
    <main data-phase={phase} style={{ background: 'var(--paper)', minHeight: '100vh', padding: '2.5rem 1.5rem' }}>
      <h1 style={{ fontSize: '2rem', letterSpacing: '0.15em', margin: 0 }}>AFTERHOURS</h1>

      <p style={{ marginTop: '1.5rem', fontSize: '1.1rem', color: abierto ? 'var(--accent)' : 'var(--ink)' }}>
        {estado === null
          ? 'ESTADO DEL MERCADO: DESCONOCIDO'
          : abierto
            ? 'WALL STREET ESTÁ ABIERTO'
            : `CERRADO HACE ${estado.hoursSinceLastTrade.toFixed(1)} H` +
              (estado.hoursUntilOpen !== null ? ` · ABRE EN ${estado.hoursUntilOpen.toFixed(1)} H` : '')}
      </p>

      {abierto ? (
        <p style={{ opacity: 0.7 }}>
          Con el mercado abierto el gap es <strong>indicativo</strong>: las dos fuentes no se miden
          en el mismo instante.
        </p>
      ) : null}

      {board.rows.length === 0 ? (
        <p style={{ marginTop: '2rem' }}>
          Todavía no hay ninguna muestra archivada.
          {universo ? ` El universo conocido tiene ${universo.entries.length} acciones tokenizadas.` : ''}
        </p>
      ) : (
        <table style={{ marginTop: '2rem', borderCollapse: 'collapse', width: '100%', maxWidth: '46rem' }}>
          <tbody>
            {board.rows.map((r) => (
              <tr key={r.symbol} style={{ borderTop: '1px solid var(--ink)' }}>
                <td style={{ padding: '0.4rem 0' }}>{r.symbol}</td>
                <td style={{ padding: '0.4rem 0', textAlign: 'right' }}>{r.gapPct.toFixed(2)} %</td>
                <td style={{ padding: '0.4rem 0', textAlign: 'right', opacity: r.calibrating ? 0.6 : 1 }}>
                  {r.calibrating ? `calibrando ${Math.round(r.progress * 100)} %` : `z ${r.z!.toFixed(2)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p style={{ marginTop: '2rem', opacity: 0.6, fontSize: '0.85rem' }}>
        {board.samples} muestras archivadas
        {universo ? ` · universo: ${universo.entries.length} acciones` : ''}
        {universo && !universo.complete ? ' (censo incompleto, se completa en la próxima corrida)' : ''}
      </p>
    </main>
  )
}
