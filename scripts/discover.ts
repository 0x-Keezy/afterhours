/**
 * Descubrimiento del universo. Es LENTO a propósito y corre aparte del poller:
 * la chain tenía 59.350 tokens ERC-20 en 1.187 páginas, y Blockscout tira 429.
 * Deja `data/universe.json`, que es lo que el poller lee cada 15 minutos.
 *
 * Persiste EN CADA CHECKPOINT, no al final: una corrida de 20 minutos que muere
 * sin checkpoints no deja nada (ya pasó). Como `mergeUniverse` nunca borra, el
 * universo se completa entre corridas aunque ninguna llegue sola hasta el final.
 *
 * Uso: npx tsx scripts/discover.ts [maxPages]
 */
import { mergeUniverse } from '../src/core/universe'
import { listStockTokens } from '../src/sources/blockscout'
import { readUniverse, writeUniverse } from '../src/store/universe'

const DATA_DIR = 'data'
const CHECKPOINT_EVERY = 25

const maxPages = Number(process.argv[2] ?? 1500)
const now = Math.floor(Date.now() / 1000)
const t0 = Date.now()

const previo = await readUniverse(DATA_DIR)
const conocidas = previo?.entries ?? []
console.log(`arranca: ${conocidas.length} acciones conocidas, tope ${maxPages} páginas`)

async function persistir(pages: number, tokens: { symbol: string; name: string; address: string }[], complete: boolean) {
  const entries = mergeUniverse(conocidas, tokens, now)
  await writeUniverse(DATA_DIR, { updatedAt: now, complete, pages, entries })
  return entries
}

const r = await listStockTokens(fetch, {
  maxPages,
  checkpointEvery: CHECKPOINT_EVERY,
  onCheckpoint: async ({ pages, tokens }) => {
    const entries = await persistir(pages, tokens, false)
    const seg = ((Date.now() - t0) / 1000).toFixed(0)
    console.log(`  página ${pages}: ${tokens.length} acciones vistas, universo ${entries.length} (${seg}s)`)
  },
})

const entries = await persistir(r.pages, r.tokens, r.complete)
const nuevas = entries.filter((e) => e.firstSeen === now).map((e) => e.symbol)
const seg = ((Date.now() - t0) / 1000).toFixed(0)

console.log(
  `FIN: páginas=${r.pages} completo=${r.complete} motivo=${r.stoppedBecause} vistas=${r.tokens.length} ` +
    `universo=${entries.length} nuevas=${nuevas.length} en ${seg}s`,
)
if (nuevas.length) console.log(`nuevas: ${nuevas.join(' ')}`)
if (!r.complete) {
  console.warn('corrida INCOMPLETA (429 o tope de páginas): no se borró nada, sólo se sumó lo visto')
}
if (entries.length === 0) {
  console.error('universo vacío: el descubrimiento no sirvió de nada')
  process.exit(1)
}
