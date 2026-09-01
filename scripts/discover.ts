/**
 * Descubrimiento del universo. Es LENTO a propósito y corre aparte del poller:
 * la chain tenía 59.350 tokens ERC-20 en 1.187 páginas, y Blockscout tira 429.
 * Deja `data/universe.json`, que es lo que el poller lee cada 15 minutos.
 */
import { mergeUniverse } from '../src/core/universe.js'
import { listStockTokens } from '../src/sources/blockscout.js'
import { readUniverse, writeUniverse } from '../src/store/universe.js'

const DATA_DIR = 'data'
const now = Math.floor(Date.now() / 1000)

const previo = await readUniverse(DATA_DIR)
const t0 = Date.now()
const r = await listStockTokens(fetch)
const segundos = ((Date.now() - t0) / 1000).toFixed(0)

const entries = mergeUniverse(previo?.entries ?? [], r.tokens, now)
const nuevos = entries.filter((e) => e.firstSeen === now).map((e) => e.symbol)

await writeUniverse(DATA_DIR, { updatedAt: now, complete: r.complete, pages: r.pages, entries })

console.log(
  `paginas=${r.pages} completo=${r.complete} encontradas=${r.tokens.length} ` +
    `universo=${entries.length} nuevas=${nuevos.length} en ${segundos}s`,
)
if (nuevos.length) console.log(`nuevas: ${nuevos.join(' ')}`)
if (!r.complete) {
  console.warn('corrida INCOMPLETA (429 o tope de páginas): no se borró nada, sólo se sumó lo visto')
}
if (entries.length === 0) {
  console.error('universo vacío: el descubrimiento no sirvió de nada')
  process.exit(1)
}
