import { listStockTokens } from '../src/sources/blockscout.js'

const t0 = Date.now()
const tokens = await listStockTokens(fetch)
console.log(`acciones tokenizadas: ${tokens.length} (en ${((Date.now() - t0) / 1000).toFixed(1)} s)`)
console.log(tokens.slice(0, 5).map((x) => `${x.symbol}  ${x.name}`).join('\n'))

const malFormados = tokens.filter((t) => !t.name.endsWith(' • Robinhood Token'))
console.log(`nombres que no terminan en el sufijo canónico: ${malFormados.length}`)

const simbolos = tokens.map((t) => t.symbol).sort()
console.log(`¿está NVDA? ${simbolos.includes('NVDA')} · ¿está HOOD? ${simbolos.includes('HOOD')}`)
console.log(simbolos.join(' '))
