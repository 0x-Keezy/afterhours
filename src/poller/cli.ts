import { listStockTokens } from '../sources/blockscout.js'
import { quoteTokens } from '../sources/dexscreener.js'
import { yahooEquitySource } from '../sources/equity.js'
import { appendSamples, compactDay, dayKey, pruneRaw } from '../store/jsonl.js'
import { pollOnce } from './run.js'

const DATA_DIR = 'data'
const KEEP_DAYS = 14
const MIN_LIQUIDITY_USD = 25_000

const now = Math.floor(Date.now() / 1000)

const r = await pollOnce({
  listStockTokens: () => listStockTokens(fetch),
  quoteTokens: (tokens) => quoteTokens(fetch, tokens),
  equity: yahooEquitySource(fetch),
  now: () => now,
  minLiquidityUsd: MIN_LIQUIDITY_USD,
})

await appendSamples(DATA_DIR, r.samples)

// Al cruzar la medianoche UTC, cerrar el día anterior y podar.
const ayer = dayKey(now - 86400)
if (dayKey(now) !== ayer) {
  await compactDay(DATA_DIR, ayer)
  const borrados = await pruneRaw(DATA_DIR, KEEP_DAYS, now)
  if (borrados.length) console.log(`podados: ${borrados.join(', ')}`)
}

console.log(
  `muestras=${r.samples.length} sin_par=${r.skippedNoPair.length} ` +
    `iliquidos=${r.skippedIlliquid.length} fallo_equity=${r.failedEquity.length}`,
)
if (r.samples.length === 0) {
  console.error('cero muestras: algo se rompió río arriba')
  process.exit(1)
}
