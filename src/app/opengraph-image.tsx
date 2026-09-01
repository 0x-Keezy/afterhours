import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { getPageState } from './state'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'AFTERHOURS — the drift of Robinhood Chain tokenized stocks while Wall Street is closed'

export const revalidate = 900

const HORA = 3600
const VENTANA = 24 * HORA

/** Los mismos pares de la interfaz. Si cambia theme.css, cambia esto. */
const PALETA = {
  day: { paper: '#f2ead0', ink: '#141426', chrome: '#e8531f', soft: '#605943' },
  dusk: { paper: '#dcd3b4', ink: '#141426', chrome: '#e8531f', soft: '#514c3b' },
  night: { paper: '#141426', ink: '#ede4c8', chrome: '#2b4a9b', soft: '#a49ebb' },
  dawn: { paper: '#c9be9c', ink: '#141426', chrome: '#e8531f', soft: '#4b4636' },
} as const

/**
 * Las tipografías van EN EL REPO, no se bajan en cada build.
 *
 * Google sirve woff2 por defecto y Satori no lo lee: el primer intento murió con
 * "Unsupported OpenType signature". Bajarlas con un User-Agent viejo funcionaba
 * a veces, y "a veces" en un build no sirve. Los dos TTF son OFL, así que se
 * versionan y el build deja de depender de la red y de un fallback silencioso
 * que dejaba la tarjeta con la tipografía equivocada sin avisar.
 */
async function fuente(archivo: string): Promise<ArrayBuffer> {
  const buf = await readFile(join(process.cwd(), 'src/app/fonts', archivo))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

export default async function Image() {
  let estado
  try {
    estado = await getPageState()
  } catch {
    estado = null
  }

  const phase = estado?.phase ?? 'night'
  const c = PALETA[phase]
  const abierto = estado?.market?.status === 'open'

  const titular = !estado
    ? 'AFTERHOURS'
    : estado.market === null
      ? 'MARKET STATE UNKNOWN'
      : abierto
        ? 'WALL STREET IS OPEN'
        : `CLOSED FOR ${estado.market.hoursSinceLastTrade.toFixed(1)} H`

  const sub =
    estado?.market && !abierto && estado.market.hoursUntilOpen !== null
      ? `OPENS IN ${estado.market.hoursUntilOpen.toFixed(1)} H`
      : abierto
        ? 'GAP IS INDICATIVE WHILE BOTH SIDES MOVE'
        : ''

  // La misma banda de 24 h de la página, con AHORA en el centro.
  const now = estado?.now ?? Math.floor(Date.now() / 1000)
  const pos = (t: number) => ((t - (now - VENTANA / 2)) / VENTANA) * 100
  const clamp = (n: number) => Math.min(100, Math.max(0, n))

  const ultimoTrade =
    estado?.market != null ? now - estado.market.hoursSinceLastTrade * HORA : null
  const abre = estado?.session?.start ?? null
  const hayCerrado = !abierto && ultimoTrade !== null && abre !== null && abre > ultimoTrade

  const [pixel, mono] = await Promise.all([
    fuente('PixelifySans.ttf'),
    fuente('CourierPrime-Regular.ttf'),
  ])
  const display = 'Pixelify Sans'
  const cuerpo = 'Courier Prime'

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: c.paper,
          color: c.ink,
          fontFamily: cuerpo,
        }}
      >
        {/* La barra de título del escritorio, igual que en la página. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: c.chrome,
            color: phase === 'night' ? c.ink : '#141426',
            padding: '16px 28px',
            fontSize: 26,
            letterSpacing: 3,
            fontFamily: display,
            borderBottom: `6px solid ${c.ink}`,
          }}
        >
          AFTERHOURS
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', padding: '44px 56px', flex: 1 }}>
          <div style={{ display: 'flex', fontSize: 26, color: c.soft, letterSpacing: 1 }}>
            Robinhood Chain trades tokenized stocks 24/7. The Nasdaq does not.
          </div>

          <div
            style={{
              display: 'flex',
              fontFamily: display,
              fontSize: titular.length > 22 ? 74 : 92,
              marginTop: 26,
              lineHeight: 1,
            }}
          >
            {titular}
          </div>

          {sub ? (
            <div style={{ display: 'flex', fontSize: 30, color: c.soft, marginTop: 18 }}>{sub}</div>
          ) : null}

          {/* La banda de 24 h. El tramo rayado es el que no tiene ancla. */}
          <div
            style={{
              display: 'flex',
              position: 'relative',
              height: 46,
              marginTop: 'auto',
              border: `4px solid ${c.ink}`,
            }}
          >
            {hayCerrado ? (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${clamp(pos(ultimoTrade!))}%`,
                  width: `${clamp(pos(abre!)) - clamp(pos(ultimoTrade!))}%`,
                  background: c.soft,
                  opacity: 0.45,
                }}
              />
            ) : null}

            {estado?.session ? (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${clamp(pos(estado.session.start))}%`,
                  width: `${clamp(pos(estado.session.end)) - clamp(pos(estado.session.start))}%`,
                  background: c.chrome,
                }}
              />
            ) : null}

            {(estado?.runs ?? []).map((t) => (
              <div
                key={t}
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${clamp(pos(t))}%`,
                  width: 3,
                  background: c.ink,
                }}
              />
            ))}

            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: '50%',
                width: 5,
                background: c.ink,
              }}
            />
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 22,
              color: c.soft,
              marginTop: 14,
              letterSpacing: 2,
            }}
          >
            <div style={{ display: 'flex' }}>12 H BACK</div>
            <div style={{ display: 'flex' }}>
              {estado ? `${estado.board.rows.length} WATCHED · ${estado.archive.samples} READINGS` : ''}
            </div>
            <div style={{ display: 'flex' }}>12 H AHEAD</div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Pixelify Sans', data: pixel, weight: 700, style: 'normal' },
        { name: 'Courier Prime', data: mono, weight: 400, style: 'normal' },
      ],
    },
  )
}
