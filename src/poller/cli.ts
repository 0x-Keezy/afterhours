import { quoteTokens } from '../sources/dexscreener'
import { yahooEquitySource } from '../sources/equity'
import { appendSamples, compactDay, dayKey, pruneRaw } from '../store/jsonl'
import { readUniverse } from '../store/universe'
import { pollOnce } from './run'

const DATA_DIR = 'data'
const KEEP_DAYS = 14
const MIN_LIQUIDITY_USD = 25_000

const now = Math.floor(Date.now() / 1000)

const universo = await readUniverse(DATA_DIR)
if (!universo || universo.entries.length === 0) {
  console.error('no hay data/universe.json: correr primero `npx tsx scripts/discover.ts`')
  process.exit(1)
}

const r = await pollOnce({
  loadUniverse: async () => universo.entries,
  quoteTokens: (tokens) => quoteTokens(fetch, tokens),
  equity: yahooEquitySource(fetch),
  now: () => now,
  minLiquidityUsd: MIN_LIQUIDITY_USD,
})

await appendSamples(DATA_DIR, r.samples)

// Cerrar el día anterior y podar, en CADA corrida.
//
// Acá había un guard que decía `if (dayKey(now) !== ayer)` con la intención de
// correr esto sólo al cruzar la medianoche UTC. Esa condición **no puede ser
// falsa**: `ayer` es `dayKey(now - 86400)`, y restar exactamente 86.400 s cae
// siempre en el día UTC anterior (UTC no tiene DST, así que no hay borde donde
// empaten). Medido: 100.000 de 100.000 verdaderas, bordes de medianoche incluidos.
//
// O sea que el bloque ya corría siempre — el guard era decoración. Lo que sí
// estaba roto era `compactDay`, que ANEXABA: dejó `data/daily` 96,86 % duplicado
// y ese archivo inflado conflictuaba en cada rebase de la CI, matando una de cada
// dos corridas del poller con sus lecturas adentro.
//
// Ahora `compactDay` reemplaza en vez de anexar, así que correrlo siempre es
// seguro (dos corridas escriben bytes idénticos) y además auto-reparable: si se
// pierde la corrida que cruzaba la medianoche, la siguiente igual cierra el día.
// `pruneRaw` ya era idempotente. Se saca el guard en vez de arreglarlo porque un
// guard de CRUCE necesita dos observaciones —el ahora contra el estado anterior
// real— y acá no hay estado anterior que consultar.
await compactDay(DATA_DIR, dayKey(now - 86400))
const borrados = await pruneRaw(DATA_DIR, KEEP_DAYS, now)
if (borrados.length) console.log(`podados: ${borrados.join(', ')}`)

console.log(
  `universo=${universo.entries.length} muestras=${r.samples.length} ` +
    `sin_par=${r.skippedNoPair.length} iliquidos=${r.skippedIlliquid.length} ` +
    `fallo_equity=${r.failedEquity.length}`,
)
if (r.samples.length === 0) {
  console.error('cero muestras: algo se rompió río arriba')
  process.exit(1)
}
