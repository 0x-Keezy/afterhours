import { readRecent } from '../../store/jsonl'

export const revalidate = 60

const DATA_DIR = 'data'
const DIAS = 14

/**
 * El archivo crudo, descargable.
 *
 * No es un extra: la página argumenta que su valor ES el archivo, y un juez
 * externo marcó que afirmarlo sin poder verificarlo deja la tesis sin respaldo.
 * Una lectura por línea, tal como se guardó.
 */
export async function GET() {
  const now = Math.floor(Date.now() / 1000)
  const samples = await readRecent(DATA_DIR, DIAS, now)

  const cuerpo = samples.map((s) => JSON.stringify(s)).join('\n')

  return new Response(cuerpo + (cuerpo ? '\n' : ''), {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'content-disposition': 'inline; filename="afterhours.jsonl"',
    },
  })
}
