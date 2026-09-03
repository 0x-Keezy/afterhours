import { readRecent } from '../../store/jsonl'
import { readRecentRemote } from '../../store/remote'

export const revalidate = 60

const DATA_DIR = 'data'
const DIAS = 14

/**
 * El archivo crudo, descargable.
 *
 * No es un extra: la página argumenta que su valor ES el archivo, y un juez
 * externo marcó que afirmarlo sin poder verificarlo deja la tesis sin respaldo.
 * Una lectura por línea, tal como se guardó.
 *
 * EN EL DEPLOY NO SE LEE EL DISCO, por la misma razón que `state.ts`: el `data/`
 * empaquetado queda congelado en la foto del momento de publicar, y el poller
 * commitea cada 15 minutos. `state.ts` ya tenía este interruptor; esta ruta se
 * quedó sin él y nadie lo notó porque el home sí se veía fresco.
 *
 * Lo que costaba, medido el 2026-09-03: servía 1.260 lecturas terminadas el
 * 2026-09-02T07:00:00Z —25,6 h de atraso, 27,7 % de cobertura— mientras el home
 * de al lado decía "4.544 readings kept" y linkeaba acá como "Raw JSONL, one line
 * per reading". Sin ninguna marca de truncado. Y empeoraba sola: se congelaba en
 * cada deploy de código y el atraso crecía 24 h por día hasta el siguiente.
 * Justo el endpoint que sostiene la tesis del producto.
 */
export async function GET() {
  const now = Math.floor(Date.now() / 1000)
  const remoto = process.env.VERCEL === '1'
  const samples = remoto
    ? await readRecentRemote(fetch, DIAS, now)
    : await readRecent(DATA_DIR, DIAS, now)

  const cuerpo = samples.map((s) => JSON.stringify(s)).join('\n')

  return new Response(cuerpo + (cuerpo ? '\n' : ''), {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'content-disposition': 'inline; filename="afterhours.jsonl"',
    },
  })
}
