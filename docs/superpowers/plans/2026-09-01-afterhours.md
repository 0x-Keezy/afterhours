# AFTERHOURS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el instrumento que mide, archiva y publica la deriva entre el precio on-chain de las acciones tokenizadas de Robinhood Chain y su precio real en Wall Street, mientras el mercado está cerrado.

**Architecture:** Adaptadores de red finos (`sources/`) que sólo traen datos; lógica de decisión pura y sin red (`core/`) que es donde viven los tests; un almacén JSONL versionado en git (`store/`); un poller que corre en GitHub Actions cada 15 min y commitea la muestra; y una app Next.js que lee el archivo y lo dibuja.

**Tech Stack:** TypeScript strict · Next.js (App Router) · Vitest · Node 20+ · npm · GitHub Actions · Vercel

**Spec:** `docs/superpowers/specs/2026-09-01-afterhours-design.md` (con la §7 enmendada el 2026-09-01: dirección visual doodle monocromo, personaje TOLL)

## Global Constraints

- **Node 20+**, TypeScript en modo `strict`, gestor de paquetes **npm**.
- **Todo adaptador de red manda `User-Agent` de navegador.** Medido: el `/search` de DexScreener devuelve **403** sin él, y Blockscout devuelve **403** sin `User-Agent` + `Accept: application/json`. No es opcional ni "por las dudas".
- **El repositorio de GitHub debe ser PÚBLICO.** El poller corre 96 veces por día; en repos privados el tier gratis de Actions da 2.000 min/mes y esto los consume en ~10 días. En repos públicos, ilimitado. Además el dataset público es coherente con el producto.
- **Todos los timestamps son epoch en segundos, UTC.** Nada de `Date` local en lógica; `now` siempre se inyecta como parámetro para que los tests sean deterministas.
- **Monocromo.** Único color permitido en toda la interfaz: el lime de RH Chain, y **sólo con el mercado abierto**. Prohibidos gradientes, glow, blur, sombras suaves, biseles, fotos y 3D.
- **La inversión papel/tinta es un corte duro, nunca una interpolación** (interpolar los dos en direcciones opuestas anula el contraste en el cruce). Respetar `prefers-reduced-motion`.
- **Prohibido nombrar instrumentos como archivos** (`MARKET.SYS`, `GAP.EXE`): en la interfaz son carteles rotulados a mano. El reloj se llama **EL RELOJ**.
- **Tipografía mono: Courier Prime.** Prohibidas por uso previo en el ledger: Silkscreen, Press Start 2P, JetBrains Mono, Space Mono, Geist Mono.
- **Constantes medidas** (no inventar otras): `chainId` de DexScreener = `"robinhood"` · chainId EVM = `4663` · Blockscout = `https://robinhoodchain.blockscout.com` · quote USDG = `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` · sufijo del nombre de una acción tokenizada = `" • Robinhood Token"` (el separador es U+2022).

---

## Estructura de archivos

```
src/
  core/
    types.ts        contratos compartidos, sin lógica
    gap.ts          gap %, mediana, MAD, z robusto, calibración   [puro]
    session.ts      estado del mercado + fase del papel            [puro]
    universe.ts     filtro de acciones y elección de par USDG      [puro]
  sources/
    http.ts         Fetcher + BROWSER_HEADERS compartidos
    blockscout.ts   enumera las acciones tokenizadas de la chain
    dexscreener.ts  precio/liquidez/volumen on-chain
    equity.ts       precio real + ventana de sesión (Yahoo)
  store/
    jsonl.ts        append, lectura, resumen diario, poda
  poller/
    run.ts          orquestación (deps inyectadas)
    cli.ts          entry point que usa el mundo real
  app/
    api/board/route.ts   el tablero servido a la página
    page.tsx             la página
    theme.css            papel/tinta como variables
tests/fixtures/    payloads reales grabados en la sesión de diseño
data/raw/          JSONL crudo, rodante de 14 días
data/daily/        resúmenes diarios compactados
.github/workflows/poll.yml
```

---

### Task 1: Andamiaje + `core/gap` (la matemática pura)

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- Create: `src/core/types.ts`
- Create: `src/core/gap.ts`
- Test: `src/core/gap.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `gapPct(onchain, reference): number` · `median(xs): number` · `mad(xs): number` · `robustZ(value, history): number | null` · `calibration(n): {ready: boolean, progress: number}` · constantes `MIN_SAMPLES = 200`, `MAD_TO_SIGMA = 1.4826`. Y los tipos de `types.ts` que usan todas las tareas siguientes.

- [ ] **Step 1: Inicializar el proyecto**

```bash
cd C:/Users/PC/Afterhours
npm init -y
npm i -D typescript vitest @types/node
npx tsc --init --strict --target ES2022 --module ESNext --moduleResolution bundler --noEmit
```

Editar `package.json` para agregar `"type": "module"` y los scripts:

```json
{
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

Crear `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
})
```

Crear `.gitignore`:

```
node_modules/
.next/
.vercel/
*.log
```

- [ ] **Step 2: Escribir los tipos compartidos**

Crear `src/core/types.ts`:

```ts
export type StockToken = { symbol: string; name: string; address: string }

export type OnchainQuote = {
  symbol: string
  address: string
  pairAddress: string
  priceUsd: number
  liquidityUsd: number
  volume24h: number
}

/** Ventana de la sesión regular tal como la publica el proveedor de equities. */
export type SessionWindow = { start: number; end: number }

export type MarketMeta = {
  regularMarketTime: number
  exchangeTimezoneName: string
  regular: SessionWindow
}

export type EquityQuote = { symbol: string; price: number; meta: MarketMeta }

export type MarketStatus = 'open' | 'closed'

export type MarketState = {
  status: MarketStatus
  hoursSinceLastTrade: number
  /** null cuando el payload no permite saber cuándo abre la próxima sesión. */
  hoursUntilOpen: number | null
}

export type Sample = {
  t: number
  symbol: string
  onchain: number
  reference: number
  gapPct: number
  liquidityUsd: number
  volume24h: number
  status: MarketStatus
}
```

- [ ] **Step 3: Escribir el test que falla**

Crear `src/core/gap.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { calibration, gapPct, mad, median, robustZ, MIN_SAMPLES } from './gap.js'

describe('gapPct', () => {
  it('reproduce la medición real de NVDA del 2026-09-01', () => {
    expect(gapPct(220.31, 220.78)).toBeCloseTo(-0.2129, 4)
  })

  it('es positivo cuando el on-chain cotiza por encima del real', () => {
    expect(gapPct(316.85 * 1.01, 316.85)).toBeCloseTo(1, 6)
  })

  it('rechaza una referencia no positiva en vez de devolver Infinity', () => {
    expect(() => gapPct(100, 0)).toThrow(/referencia/)
    expect(() => gapPct(100, -5)).toThrow(/referencia/)
  })
})

describe('median', () => {
  it('devuelve el del medio con longitud impar', () => {
    expect(median([3, 1, 2])).toBe(2)
  })

  it('promedia los dos del medio con longitud par', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5)
  })

  it('rechaza la serie vacía', () => {
    expect(() => median([])).toThrow(/vacía/)
  })
})

describe('mad', () => {
  it('ignora el outlier, que es justamente para lo que sirve', () => {
    expect(mad([1, 2, 3, 4, 100])).toBe(1)
  })
})

describe('robustZ', () => {
  const historia = (valor: (i: number) => number) =>
    Array.from({ length: MIN_SAMPLES }, (_, i) => valor(i))

  it('devuelve null si no hay muestras suficientes (no inventa un z)', () => {
    expect(robustZ(-0.9, [-0.3, -0.1, -0.2])).toBeNull()
  })

  it('devuelve null si la dispersión es cero', () => {
    expect(robustZ(-0.9, historia(() => -0.2))).toBeNull()
  })

  it('mide cuántas desviaciones robustas se aleja el valor', () => {
    // mediana -0.2, MAD 0.1  ->  (-0.9 + 0.2) / (1.4826 * 0.1)
    const h = historia((i) => (i % 2 === 0 ? -0.3 : -0.1))
    expect(robustZ(-0.9, h)).toBeCloseTo(-4.72, 2)
  })
})

describe('calibration', () => {
  it('no está lista antes del mínimo y reporta el avance', () => {
    expect(calibration(50)).toEqual({ ready: false, progress: 0.25 })
  })

  it('está lista al alcanzar el mínimo y el avance queda tope en 1', () => {
    expect(calibration(MIN_SAMPLES)).toEqual({ ready: true, progress: 1 })
    expect(calibration(MIN_SAMPLES * 3)).toEqual({ ready: true, progress: 1 })
  })
})
```

- [ ] **Step 4: Correr el test y verificar que falla**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./gap.js"`

- [ ] **Step 5: Implementar el mínimo**

Crear `src/core/gap.ts`:

```ts
/** Muestras necesarias antes de publicar un z-score. 200 ≈ 2 días de poller a 15 min. */
export const MIN_SAMPLES = 200

/** Escala que hace comparable el MAD con una desviación estándar en datos normales. */
export const MAD_TO_SIGMA = 1.4826

export function gapPct(onchain: number, reference: number): number {
  if (!Number.isFinite(reference) || reference <= 0) {
    throw new Error(`referencia inválida: ${reference}`)
  }
  return ((onchain - reference) / reference) * 100
}

export function median(xs: number[]): number {
  if (xs.length === 0) throw new Error('serie vacía')
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]
}

export function mad(xs: number[]): number {
  const m = median(xs)
  return median(xs.map((x) => Math.abs(x - m)))
}

/** null = todavía no se puede afirmar nada. Nunca se devuelve un número inventado. */
export function robustZ(value: number, history: number[]): number | null {
  if (history.length < MIN_SAMPLES) return null
  const spread = mad(history) * MAD_TO_SIGMA
  if (spread === 0) return null
  return (value - median(history)) / spread
}

export function calibration(n: number): { ready: boolean; progress: number } {
  return { ready: n >= MIN_SAMPLES, progress: Math.min(1, n / MIN_SAMPLES) }
}
```

- [ ] **Step 6: Correr el test y verificar que pasa**

Run: `npm test`
Expected: PASS — 11 tests

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore src/core/
git commit -m "feat(core): gap, mediana, MAD y z robusto con calibración honesta"
```

---

### Task 2: `core/session` — estado del mercado y fase del papel

**Files:**
- Create: `src/core/session.ts`
- Test: `src/core/session.test.ts`

**Interfaces:**
- Consumes: `MarketMeta`, `MarketState`, `MarketStatus` de `src/core/types.ts` (Task 1).
- Produces: `marketState(meta: MarketMeta, nowSec: number): MarketState` · `paperPhase(state: MarketState): PaperPhase` donde `export type PaperPhase = 'day' | 'dusk' | 'night' | 'dawn'`.

- [ ] **Step 1: Escribir el test que falla**

Los números son los **medidos el 2026-09-01** contra Yahoo, no inventados: último trade `1788206401`, sesión regular `1788269400`–`1788292800`.

Crear `src/core/session.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { MarketMeta } from './types.js'
import { marketState, paperPhase } from './session.js'

const META: MarketMeta = {
  regularMarketTime: 1788206401,
  exchangeTimezoneName: 'America/New_York',
  regular: { start: 1788269400, end: 1788292800 },
}

describe('marketState', () => {
  it('reproduce la medición real: cerrado, 9.2 h desde el último trade, 8.3 h para abrir', () => {
    const s = marketState(META, 1788239520)
    expect(s.status).toBe('closed')
    expect(s.hoursSinceLastTrade).toBeCloseTo(9.2, 1)
    expect(s.hoursUntilOpen).toBeCloseTo(8.3, 1)
  })

  it('está abierto dentro de la ventana regular', () => {
    const s = marketState(META, 1788280000)
    expect(s.status).toBe('open')
    expect(s.hoursUntilOpen).toBeNull()
  })

  it('después del cierre no inventa la próxima apertura', () => {
    const s = marketState(META, 1788292801)
    expect(s.status).toBe('closed')
    expect(s.hoursUntilOpen).toBeNull()
  })

  it('nunca reporta horas negativas desde el último trade', () => {
    expect(marketState(META, 1788206000).hoursSinceLastTrade).toBe(0)
  })
})

describe('paperPhase', () => {
  it('es de día con el mercado abierto', () => {
    expect(paperPhase({ status: 'open', hoursSinceLastTrade: 1, hoursUntilOpen: null })).toBe('day')
  })

  it('es atardecer en las primeras horas tras el cierre', () => {
    expect(paperPhase({ status: 'closed', hoursSinceLastTrade: 2, hoursUntilOpen: null })).toBe('dusk')
  })

  it('es noche cerrada cuando falta mucho para abrir', () => {
    expect(paperPhase({ status: 'closed', hoursSinceLastTrade: 9, hoursUntilOpen: 8 })).toBe('night')
  })

  it('es amanecer cuando la apertura está cerca', () => {
    expect(paperPhase({ status: 'closed', hoursSinceLastTrade: 15, hoursUntilOpen: 1.5 })).toBe('dawn')
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/core/session.test.ts`
Expected: FAIL — `Failed to resolve import "./session.js"`

- [ ] **Step 3: Implementar el mínimo**

Crear `src/core/session.ts`:

```ts
import type { MarketMeta, MarketState } from './types.js'

export type PaperPhase = 'day' | 'dusk' | 'night' | 'dawn'

const HOUR = 3600
/** Horas tras el cierre que todavía se leen como "recién cerró". */
const DUSK_HOURS = 3
/** Horas antes de la apertura en que el papel empieza a aclarar. */
const DAWN_HOURS = 2

export function marketState(meta: MarketMeta, nowSec: number): MarketState {
  const open = nowSec >= meta.regular.start && nowSec <= meta.regular.end
  const hoursSinceLastTrade = Math.max(0, (nowSec - meta.regularMarketTime) / HOUR)
  const hoursUntilOpen = nowSec < meta.regular.start ? (meta.regular.start - nowSec) / HOUR : null
  return { status: open ? 'open' : 'closed', hoursSinceLastTrade, hoursUntilOpen }
}

/**
 * Fase del papel. Es un CORTE: cada estado tiene su par papel/tinta fijo y se
 * salta de uno al otro. Interpolar papel y tinta en direcciones opuestas los
 * cruza y en el cruce el contraste llega a cero.
 */
export function paperPhase(state: MarketState): PaperPhase {
  if (state.status === 'open') return 'day'
  if (state.hoursUntilOpen !== null && state.hoursUntilOpen <= DAWN_HOURS) return 'dawn'
  if (state.hoursSinceLastTrade <= DUSK_HOURS) return 'dusk'
  return 'night'
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/core/session.test.ts`
Expected: PASS — 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/core/session.ts src/core/session.test.ts
git commit -m "feat(core): estado del mercado y fase del papel derivados de la sesión real"
```

---

### Task 3: `core/universe` — filtro de acciones y elección de par

**Files:**
- Create: `src/core/universe.ts`
- Test: `src/core/universe.test.ts`

**Interfaces:**
- Consumes: `OnchainQuote` de `types.ts`.
- Produces: `STOCK_NAME_SUFFIX` · `isStockToken(name: string): boolean` · `pickUsdgPair(pairs: DexPair[], symbol: string): DexPair | null` · `watchlist(quotes: OnchainQuote[], minLiquidityUsd: number): OnchainQuote[]` · el tipo `DexPair` (forma cruda del payload de DexScreener, la usa `sources/dexscreener` en Task 5).

- [ ] **Step 1: Escribir el test que falla**

Crear `src/core/universe.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { DexPair } from './universe.js'
import { isStockToken, pickUsdgPair, watchlist } from './universe.js'

const par = (over: Partial<DexPair> & { symbol: string; quote: string; liq: number }): DexPair => ({
  chainId: 'robinhood',
  pairAddress: `0xpair-${over.symbol}-${over.quote}-${over.liq}`,
  baseToken: { address: '0xbase', name: `${over.symbol} • Robinhood Token`, symbol: over.symbol },
  quoteToken: { address: '0xquote', name: over.quote, symbol: over.quote },
  priceUsd: '100',
  liquidity: { usd: over.liq },
  volume: { h24: 1000 },
})

describe('isStockToken', () => {
  it('acepta el nombre canónico medido en la chain', () => {
    expect(isStockToken('NVIDIA • Robinhood Token')).toBe(true)
  })

  it('rechaza un memecoin que sólo menciona Robinhood', () => {
    expect(isStockToken('Robinhood Token Killer')).toBe(false)
    expect(isStockToken('HOODRAT')).toBe(false)
  })

  it('exige el separador exacto U+2022, no un guion', () => {
    expect(isStockToken('NVIDIA - Robinhood Token')).toBe(false)
  })
})

describe('pickUsdgPair', () => {
  it('elige el par USDG más líquido cuando hay varios', () => {
    const p = pickUsdgPair(
      [par({ symbol: 'NVDA', quote: 'USDG', liq: 100 }), par({ symbol: 'NVDA', quote: 'USDG', liq: 5270875 })],
      'NVDA',
    )
    expect(p?.liquidity.usd).toBe(5270875)
  })

  it('ignora los pares que no son contra USDG', () => {
    expect(pickUsdgPair([par({ symbol: 'NVDA', quote: 'WETH', liq: 999999 })], 'NVDA')).toBeNull()
  })

  it('ignora pares de otra chain', () => {
    const ajeno = { ...par({ symbol: 'NVDA', quote: 'USDG', liq: 10 }), chainId: 'solana' }
    expect(pickUsdgPair([ajeno], 'NVDA')).toBeNull()
  })

  it('devuelve null para HOOD, que no tiene par USDG (caso real medido)', () => {
    expect(pickUsdgPair([], 'HOOD')).toBeNull()
  })
})

describe('watchlist', () => {
  it('deja fuera lo ilíquido y ordena por liquidez descendente', () => {
    const q = (symbol: string, liquidityUsd: number) => ({
      symbol, address: '0x', pairAddress: '0x', priceUsd: 1, liquidityUsd, volume24h: 0,
    })
    const out = watchlist([q('COIN', 56787), q('NVDA', 5270875), q('MICRO', 900)], 25000)
    expect(out.map((o) => o.symbol)).toEqual(['NVDA', 'COIN'])
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/core/universe.test.ts`
Expected: FAIL — `Failed to resolve import "./universe.js"`

- [ ] **Step 3: Implementar el mínimo**

Crear `src/core/universe.ts`:

```ts
import type { OnchainQuote } from './types.js'

/** Separador U+2022. Medido en la chain: `NVIDIA • Robinhood Token`. */
export const STOCK_NAME_SUFFIX = ' \u2022 Robinhood Token'

export const DEX_CHAIN_ID = 'robinhood'
export const USDG_SYMBOL = 'USDG'

export type DexPair = {
  chainId: string
  pairAddress: string
  baseToken: { address: string; name: string; symbol: string }
  quoteToken: { address: string; name: string; symbol: string }
  priceUsd: string
  liquidity?: { usd?: number }
  volume?: { h24?: number }
}

export function isStockToken(name: string): boolean {
  return name.endsWith(STOCK_NAME_SUFFIX)
}

export function pickUsdgPair(pairs: DexPair[], symbol: string): DexPair | null {
  const candidatos = pairs.filter(
    (p) =>
      p.chainId === DEX_CHAIN_ID &&
      p.baseToken.symbol.toUpperCase() === symbol.toUpperCase() &&
      p.quoteToken.symbol.toUpperCase() === USDG_SYMBOL,
  )
  if (candidatos.length === 0) return null
  return candidatos.reduce((mejor, p) =>
    (p.liquidity?.usd ?? 0) > (mejor.liquidity?.usd ?? 0) ? p : mejor,
  )
}

export function watchlist(quotes: OnchainQuote[], minLiquidityUsd: number): OnchainQuote[] {
  return quotes
    .filter((q) => q.liquidityUsd >= minLiquidityUsd)
    .sort((a, b) => b.liquidityUsd - a.liquidityUsd)
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/core/universe.test.ts`
Expected: PASS — 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/core/universe.ts src/core/universe.test.ts
git commit -m "feat(core): censo de acciones y elección del par USDG más líquido"
```

---

### Task 4: `sources/blockscout` — enumerar el universo

DexScreener **no sirve** para esto: su `/search` corta en 30 pares (medido con `q=USDG`, `q=Robinhood Token` y `/tokens/{USDG}`). El listado completo sale del Blockscout de la chain.

**Files:**
- Create: `src/sources/http.ts`
- Create: `src/sources/blockscout.ts`
- Test: `src/sources/blockscout.test.ts`

**Interfaces:**
- Consumes: `StockToken` de `types.ts`, `isStockToken` de `core/universe`.
- Produces: `type Fetcher = (url: string, init?: { headers: Record<string, string> }) => Promise<Response>` y `BROWSER_HEADERS` desde `sources/http.ts` (los usan las Tasks 5 y 6) · `encodePageParams(p: Record<string, unknown>): string` · `listStockTokens(fetcher: Fetcher, baseUrl?: string): Promise<StockToken[]>`.

- [ ] **Step 1: Escribir el test que falla**

`encodePageParams` no es un detalle: con `urlencode` ingenuo, el `false` de `is_name_null` viaja como `False` y la página 2 devuelve **422**. Eso ya pasó al medir.

Crear `src/sources/blockscout.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { encodePageParams, listStockTokens } from './blockscout.js'

describe('encodePageParams', () => {
  it('serializa el booleano en minúscula (con "False" la API devuelve 422)', () => {
    expect(encodePageParams({ is_name_null: false })).toBe('is_name_null=false')
  })

  it('manda el null como valor vacío, no como la cadena "null"', () => {
    expect(encodePageParams({ market_cap: null })).toBe('market_cap=')
  })

  it('escapa los espacios del nombre', () => {
    expect(encodePageParams({ name: 'Hey Anon' })).toBe('name=Hey+Anon')
  })
})

const pagina = (items: unknown[], next: unknown = null) =>
  new Response(JSON.stringify({ items, next_page_params: next }), { status: 200 })

describe('listStockTokens', () => {
  it('se queda sólo con las acciones tokenizadas y descarta el resto', async () => {
    const fetcher = async () =>
      pagina([
        { symbol: 'NVDA', name: 'NVIDIA \u2022 Robinhood Token', address: '0xnvda' },
        { symbol: 'USDG', name: 'Global Dollar', address: '0xusdg' },
        { symbol: 'HOODRAT', name: 'HOODRAT', address: '0xrat' },
      ])
    const out = await listStockTokens(fetcher)
    expect(out).toEqual([{ symbol: 'NVDA', name: 'NVIDIA \u2022 Robinhood Token', address: '0xnvda' }])
  })

  it('sigue la paginación hasta que no hay next_page_params', async () => {
    const paginas = [
      pagina([{ symbol: 'AAPL', name: 'Apple \u2022 Robinhood Token', address: '0xa' }], { name: 'x', is_name_null: false }),
      pagina([{ symbol: 'TSLA', name: 'Tesla \u2022 Robinhood Token', address: '0xt' }]),
    ]
    let i = 0
    const out = await listStockTokens(async () => paginas[i++])
    expect(out.map((t) => t.symbol)).toEqual(['AAPL', 'TSLA'])
    expect(i).toBe(2)
  })

  it('manda User-Agent de navegador (sin él la API devuelve 403)', async () => {
    let visto: Record<string, string> = {}
    await listStockTokens(async (_url, init) => {
      visto = init?.headers ?? {}
      return pagina([])
    })
    expect(visto['User-Agent']).toMatch(/Mozilla/)
    expect(visto['Accept']).toMatch(/application\/json/)
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/sources/blockscout.test.ts`
Expected: FAIL — `Failed to resolve import "./blockscout.js"`

- [ ] **Step 3: Implementar el mínimo**

Crear `src/sources/http.ts`:

```ts
export type Fetcher = (url: string, init?: { headers: Record<string, string> }) => Promise<Response>

/**
 * Sin estas cabeceras, Blockscout y el /search de DexScreener devuelven 403.
 * Medido el 2026-09-01; no es defensivo, es requisito.
 */
export const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
}
```

Crear `src/sources/blockscout.ts`:

```ts
import { isStockToken } from '../core/universe.js'
import type { StockToken } from '../core/types.js'
import { BROWSER_HEADERS, type Fetcher } from './http.js'

export const BLOCKSCOUT_URL = 'https://robinhoodchain.blockscout.com'

/** Los booleanos deben ir en minúscula y los null vacíos, o la página siguiente da 422. */
export function encodePageParams(p: Record<string, unknown>): string {
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(p)) {
    if (v === null || v === undefined) usp.append(k, '')
    else if (typeof v === 'boolean') usp.append(k, v ? 'true' : 'false')
    else usp.append(k, String(v))
  }
  return usp.toString()
}

type Page = { items?: unknown[]; next_page_params?: Record<string, unknown> | null }

export async function listStockTokens(fetcher: Fetcher, baseUrl = BLOCKSCOUT_URL): Promise<StockToken[]> {
  const out: StockToken[] = []
  let params: Record<string, unknown> | null = null
  // Tope de seguridad: la chain tenía >3.000 tokens ERC-20 al medir.
  for (let page = 0; page < 400; page++) {
    const qs = params ? `&${encodePageParams(params)}` : ''
    const res = await fetcher(`${baseUrl}/api/v2/tokens?type=ERC-20${qs}`, { headers: BROWSER_HEADERS })
    if (!res.ok) throw new Error(`blockscout ${res.status} en la página ${page + 1}`)
    const data = (await res.json()) as Page
    const items = data.items ?? []
    for (const raw of items) {
      const it = raw as { symbol?: string; name?: string; address?: string; address_hash?: string }
      const name = it.name ?? ''
      const address = it.address ?? it.address_hash
      if (it.symbol && address && isStockToken(name)) out.push({ symbol: it.symbol, name, address })
    }
    if (!data.next_page_params || items.length === 0) break
    params = data.next_page_params
  }
  return out
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/sources/blockscout.test.ts`
Expected: PASS — 6 tests

- [ ] **Step 5: Verificar contra la chain de verdad**

Run:

```bash
node --input-type=module -e "
import {listStockTokens} from './src/sources/blockscout.js';
const t = await listStockTokens(fetch);
console.log('acciones tokenizadas:', t.length);
console.log(t.slice(0,5).map(x=>x.symbol+' '+x.name).join('\n'));
"
```

Expected: imprime al menos 194 símbolos (el piso medido el 2026-09-01) y los nombres terminan en `• Robinhood Token`. Si sale menos de 100, la paginación se está cortando: revisar `encodePageParams`.

- [ ] **Step 6: Commit**

```bash
git add src/sources/http.ts src/sources/blockscout.ts src/sources/blockscout.test.ts
git commit -m "feat(sources): enumerar las acciones tokenizadas por Blockscout con paginación correcta"
```

---

### Task 5: `sources/dexscreener` — precio on-chain con lote verificado

Medido: el lote `/tokens/v1/robinhood/{csv}` devolvió **4 de 6** direcciones pedidas, y el endpoint legacy corta en 30 **pares**. Por eso el lote no se confía: se verifica la cobertura y se reintenta individualmente lo que falte.

**Files:**
- Create: `src/sources/dexscreener.ts`
- Test: `src/sources/dexscreener.test.ts`

**Interfaces:**
- Consumes: `Fetcher`, `BROWSER_HEADERS` (Task 4) · `DexPair`, `pickUsdgPair` (Task 3) · `OnchainQuote`, `StockToken` (Task 1).
- Produces: `quoteTokens(fetcher: Fetcher, tokens: StockToken[], batchSize?: number): Promise<OnchainQuote[]>`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/sources/dexscreener.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { StockToken } from '../core/types.js'
import { quoteTokens } from './dexscreener.js'

const tok = (symbol: string, address: string): StockToken => ({
  symbol, address, name: `${symbol} \u2022 Robinhood Token`,
})

const par = (symbol: string, address: string, liq: number) => ({
  chainId: 'robinhood',
  pairAddress: `0xpair${symbol}`,
  baseToken: { address, name: `${symbol} \u2022 Robinhood Token`, symbol },
  quoteToken: { address: '0xusdg', name: 'Global Dollar', symbol: 'USDG' },
  priceUsd: '220.31',
  liquidity: { usd: liq },
  volume: { h24: 34261770 },
})

const ok = (pairs: unknown[]) => new Response(JSON.stringify(pairs), { status: 200 })

describe('quoteTokens', () => {
  it('convierte el par en cotización usando el par USDG más líquido', async () => {
    const out = await quoteTokens(async () => ok([par('NVDA', '0xnvda', 5270875)]), [tok('NVDA', '0xnvda')])
    expect(out).toEqual([{
      symbol: 'NVDA', address: '0xnvda', pairAddress: '0xpairNVDA',
      priceUsd: 220.31, liquidityUsd: 5270875, volume24h: 34261770,
    }])
  })

  it('reintenta individualmente lo que el lote omitió (pasó de verdad: 4 de 6)', async () => {
    const llamadas: string[] = []
    const fetcher = async (url: string) => {
      llamadas.push(url)
      if (url.includes(',')) return ok([par('AAPL', '0xaapl', 464222)]) // omite NVDA
      return ok([par('NVDA', '0xnvda', 5270875)])
    }
    const out = await quoteTokens(fetcher, [tok('AAPL', '0xaapl'), tok('NVDA', '0xnvda')])
    expect(out.map((o) => o.symbol).sort()).toEqual(['AAPL', 'NVDA'])
    expect(llamadas).toHaveLength(2)
  })

  it('omite sin romper el ticker que no tiene par USDG (caso real: HOOD)', async () => {
    const out = await quoteTokens(async () => ok([]), [tok('HOOD', '0xhood')])
    expect(out).toEqual([])
  })

  it('parte el pedido en lotes del tamaño indicado', async () => {
    const llamadas: string[] = []
    await quoteTokens(
      async (url) => { llamadas.push(url); return ok([]) },
      [tok('A', '0xa'), tok('B', '0xb'), tok('C', '0xc')],
      2,
    )
    // 2 lotes + 3 reintentos individuales (el fake nunca devuelve nada)
    expect(llamadas.filter((u) => u.includes(',')).length).toBe(1)
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/sources/dexscreener.test.ts`
Expected: FAIL — `Failed to resolve import "./dexscreener.js"`

- [ ] **Step 3: Implementar el mínimo**

Crear `src/sources/dexscreener.ts`:

```ts
import type { OnchainQuote, StockToken } from '../core/types.js'
import { DEX_CHAIN_ID, pickUsdgPair, type DexPair } from '../core/universe.js'
import { BROWSER_HEADERS, type Fetcher } from './http.js'

const BASE = 'https://api.dexscreener.com/tokens/v1'

async function pedir(fetcher: Fetcher, addresses: string[]): Promise<DexPair[]> {
  const res = await fetcher(`${BASE}/${DEX_CHAIN_ID}/${addresses.join(',')}`, { headers: BROWSER_HEADERS })
  if (!res.ok) return []
  const data = (await res.json()) as unknown
  return Array.isArray(data) ? (data as DexPair[]) : ((data as { pairs?: DexPair[] }).pairs ?? [])
}

function aCotizacion(pares: DexPair[], t: StockToken): OnchainQuote | null {
  const p = pickUsdgPair(pares, t.symbol)
  if (!p) return null
  const priceUsd = Number(p.priceUsd)
  if (!Number.isFinite(priceUsd)) return null
  return {
    symbol: t.symbol,
    address: t.address,
    pairAddress: p.pairAddress,
    priceUsd,
    liquidityUsd: p.liquidity?.usd ?? 0,
    volume24h: p.volume?.h24 ?? 0,
  }
}

/**
 * El lote no se confía: medido, devolvió 4 de 6 direcciones pedidas. Se verifica
 * la cobertura y se reintenta de a uno lo que falte.
 */
export async function quoteTokens(
  fetcher: Fetcher,
  tokens: StockToken[],
  batchSize = 5,
): Promise<OnchainQuote[]> {
  const out: OnchainQuote[] = []
  const faltantes: StockToken[] = []

  for (let i = 0; i < tokens.length; i += batchSize) {
    const lote = tokens.slice(i, i + batchSize)
    const pares = await pedir(fetcher, lote.map((t) => t.address))
    for (const t of lote) {
      const q = aCotizacion(pares, t)
      if (q) out.push(q)
      else faltantes.push(t)
    }
  }

  for (const t of faltantes) {
    const q = aCotizacion(await pedir(fetcher, [t.address]), t)
    if (q) out.push(q)
  }

  return out
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/sources/dexscreener.test.ts`
Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/sources/dexscreener.ts src/sources/dexscreener.test.ts
git commit -m "feat(sources): cotización on-chain por lote con reintento individual verificado"
```

---

### Task 6: `sources/equity` — el precio real y la ventana de sesión

Yahoo v7 (`/quote?symbols=`) devuelve **401** sin crumb: no hay lote. Es una request por ticker vía v8 chart, y por eso la lista se acota por liquidez en Task 7.

**Files:**
- Create: `src/sources/equity.ts`
- Create: `tests/fixtures/yahoo-nvda.json`
- Test: `src/sources/equity.test.ts`

**Interfaces:**
- Consumes: `Fetcher`, `BROWSER_HEADERS` (Task 4) · `EquityQuote`, `MarketMeta` (Task 1).
- Produces: `interface EquitySource { quote(symbol: string): Promise<EquityQuote> }` · `yahooEquitySource(fetcher: Fetcher): EquitySource`.

- [ ] **Step 1: Grabar el fixture con la forma real**

Crear `tests/fixtures/yahoo-nvda.json` (recorte del payload medido el 2026-09-01):

```json
{
  "chart": {
    "result": [
      {
        "meta": {
          "currency": "USD",
          "symbol": "NVDA",
          "exchangeName": "NMS",
          "regularMarketTime": 1788206401,
          "regularMarketPrice": 220.78,
          "chartPreviousClose": 217.55,
          "exchangeTimezoneName": "America/New_York",
          "currentTradingPeriod": {
            "pre": { "start": 1788249600, "end": 1788269400, "gmtoffset": -14400 },
            "regular": { "start": 1788269400, "end": 1788292800, "gmtoffset": -14400 },
            "post": { "start": 1788292800, "end": 1788307200, "gmtoffset": -14400 }
          }
        }
      }
    ],
    "error": null
  }
}
```

- [ ] **Step 2: Escribir el test que falla**

Crear `src/sources/equity.test.ts`:

```ts
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { yahooEquitySource } from './equity.js'

const fixture = JSON.parse(await readFile('tests/fixtures/yahoo-nvda.json', 'utf8'))
const ok = () => new Response(JSON.stringify(fixture), { status: 200 })

describe('yahooEquitySource', () => {
  it('extrae precio y ventana de sesión del payload real', async () => {
    const q = await yahooEquitySource(ok).quote('NVDA')
    expect(q.price).toBe(220.78)
    expect(q.meta.regularMarketTime).toBe(1788206401)
    expect(q.meta.regular).toEqual({ start: 1788269400, end: 1788292800 })
    expect(q.meta.exchangeTimezoneName).toBe('America/New_York')
  })

  it('manda User-Agent de navegador', async () => {
    let headers: Record<string, string> = {}
    await yahooEquitySource(async (_u, init) => { headers = init?.headers ?? {}; return ok() }).quote('NVDA')
    expect(headers['User-Agent']).toMatch(/Mozilla/)
  })

  it('falla con un mensaje que nombra el ticker cuando la respuesta no sirve', async () => {
    const vacio = async () => new Response(JSON.stringify({ chart: { result: [] } }), { status: 200 })
    await expect(yahooEquitySource(vacio).quote('TSLA')).rejects.toThrow(/TSLA/)
  })

  it('falla si el HTTP no es 200 (el proveedor puede cortar sin aviso)', async () => {
    const err = async () => new Response('nope', { status: 429 })
    await expect(yahooEquitySource(err).quote('NVDA')).rejects.toThrow(/429/)
  })
})
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `npx vitest run src/sources/equity.test.ts`
Expected: FAIL — `Failed to resolve import "./equity.js"`

- [ ] **Step 4: Implementar el mínimo**

Crear `src/sources/equity.ts`:

```ts
import type { EquityQuote } from '../core/types.js'
import { BROWSER_HEADERS, type Fetcher } from './http.js'

export interface EquitySource {
  quote(symbol: string): Promise<EquityQuote>
}

const BASE = 'https://query1.finance.yahoo.com/v8/finance/chart'

/**
 * Yahoo no es una API oficial y puede cortar. Toda la dependencia vive acá:
 * cambiar de proveedor es escribir otro EquitySource, sin tocar el resto.
 */
export function yahooEquitySource(fetcher: Fetcher): EquitySource {
  return {
    async quote(symbol: string): Promise<EquityQuote> {
      const res = await fetcher(`${BASE}/${symbol}?range=1d&interval=1d`, { headers: BROWSER_HEADERS })
      if (!res.ok) throw new Error(`equity ${symbol}: HTTP ${res.status}`)
      const data = (await res.json()) as {
        chart?: { result?: Array<{ meta?: Record<string, unknown> }> }
      }
      const meta = data.chart?.result?.[0]?.meta
      const regular = (meta?.currentTradingPeriod as { regular?: { start: number; end: number } } | undefined)?.regular
      const price = meta?.regularMarketPrice
      if (typeof price !== 'number' || !regular) {
        throw new Error(`equity ${symbol}: respuesta sin precio o sin ventana de sesión`)
      }
      return {
        symbol,
        price,
        meta: {
          regularMarketTime: Number(meta.regularMarketTime),
          exchangeTimezoneName: String(meta.exchangeTimezoneName ?? 'America/New_York'),
          regular: { start: regular.start, end: regular.end },
        },
      }
    },
  }
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npx vitest run src/sources/equity.test.ts`
Expected: PASS — 4 tests

- [ ] **Step 6: Commit**

```bash
git add src/sources/equity.ts src/sources/equity.test.ts tests/fixtures/yahoo-nvda.json
git commit -m "feat(sources): precio real y ventana de sesión aislados tras EquitySource"
```

---

### Task 7: `store/jsonl` — el archivo, que es el producto

**Files:**
- Create: `src/store/jsonl.ts`
- Test: `src/store/jsonl.test.ts`

**Interfaces:**
- Consumes: `Sample` (Task 1).
- Produces: `dayKey(tSec): string` · `appendSamples(dir, samples): Promise<void>` · `readDay(dir, day): Promise<Sample[]>` · `readRecent(dir, days, nowSec): Promise<Sample[]>` · `summarize(day, samples): DailySummary[]` · `compactDay(dir, day): Promise<DailySummary[]>` · `pruneRaw(dir, keepDays, nowSec): Promise<string[]>` · tipo `DailySummary`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/store/jsonl.test.ts`:

```ts
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Sample } from '../core/types.js'
import { appendSamples, compactDay, dayKey, pruneRaw, readDay, readRecent, summarize } from './jsonl.js'

const T = 1788239520 // 2026-09-01 UTC, hora de la medición real
const s = (over: Partial<Sample> = {}): Sample => ({
  t: T, symbol: 'NVDA', onchain: 220.31, reference: 220.78, gapPct: -0.2129,
  liquidityUsd: 5270875, volume24h: 34261770, status: 'closed', ...over,
})
const dir = () => mkdtemp(join(tmpdir(), 'afterhours-'))

describe('dayKey', () => {
  it('usa UTC, no la hora local', () => {
    expect(dayKey(T)).toBe('2026-09-01')
  })
})

describe('append y lectura', () => {
  it('escribe una línea por muestra y la relee igual', async () => {
    const d = await dir()
    await appendSamples(d, [s(), s({ symbol: 'TSLA' })])
    expect(await readDay(d, '2026-09-01')).toEqual([s(), s({ symbol: 'TSLA' })])
  })

  it('agrega sin pisar lo ya escrito', async () => {
    const d = await dir()
    await appendSamples(d, [s()])
    await appendSamples(d, [s({ symbol: 'SPY' })])
    expect((await readDay(d, '2026-09-01')).map((x) => x.symbol)).toEqual(['NVDA', 'SPY'])
  })

  it('un día sin archivo devuelve vacío en vez de reventar', async () => {
    expect(await readDay(await dir(), '2020-01-01')).toEqual([])
  })

  it('ignora una línea corrupta en vez de perder el día entero', async () => {
    const d = await dir()
    await appendSamples(d, [s()])
    const { appendFile } = await import('node:fs/promises')
    await appendFile(join(d, 'raw', '2026-09-01.jsonl'), '{roto\n')
    expect(await readDay(d, '2026-09-01')).toHaveLength(1)
  })

  it('readRecent junta los días de la ventana pedida', async () => {
    const d = await dir()
    await appendSamples(d, [s({ t: T - 86400 }), s()])
    expect(await readRecent(d, 2, T)).toHaveLength(2)
    expect(await readRecent(d, 1, T)).toHaveLength(1)
  })
})

describe('summarize', () => {
  it('resume por símbolo con apertura, cierre, extremos y mediana', async () => {
    const out = summarize('2026-09-01', [
      s({ t: T, gapPct: -0.2 }), s({ t: T + 900, gapPct: -0.6 }), s({ t: T + 1800, gapPct: -0.4 }),
    ])
    expect(out).toEqual([{
      day: '2026-09-01', symbol: 'NVDA', n: 3,
      open: -0.2, close: -0.4, min: -0.6, max: -0.2, median: -0.4,
      liquidityUsd: 5270875,
    }])
  })

  it('ordena por tiempo antes de decidir apertura y cierre', () => {
    const out = summarize('2026-09-01', [s({ t: T + 900, gapPct: -0.6 }), s({ t: T, gapPct: -0.2 })])
    expect(out[0].open).toBe(-0.2)
    expect(out[0].close).toBe(-0.6)
  })
})

describe('compactDay y pruneRaw', () => {
  it('escribe el resumen del día en daily/', async () => {
    const d = await dir()
    await appendSamples(d, [s(), s({ t: T + 900, gapPct: -0.6 })])
    await compactDay(d, '2026-09-01')
    const txt = await readFile(join(d, 'daily', '2026-09.jsonl'), 'utf8')
    expect(JSON.parse(txt.trim())).toMatchObject({ day: '2026-09-01', symbol: 'NVDA', n: 2 })
  })

  it('borra el crudo más viejo que la ventana y devuelve qué borró', async () => {
    const d = await dir()
    await appendSamples(d, [s({ t: T - 20 * 86400 }), s()])
    const borrados = await pruneRaw(d, 14, T)
    expect(borrados).toEqual(['2026-08-12'])
    expect(await readDay(d, '2026-09-01')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/store/jsonl.test.ts`
Expected: FAIL — `Failed to resolve import "./jsonl.js"`

- [ ] **Step 3: Implementar el mínimo**

Crear `src/store/jsonl.ts`:

```ts
import { appendFile, mkdir, readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { Sample } from '../core/types.js'
import { median } from '../core/gap.js'

export type DailySummary = {
  day: string
  symbol: string
  n: number
  open: number
  close: number
  min: number
  max: number
  median: number
  liquidityUsd: number
}

const DAY = 86400

export function dayKey(tSec: number): string {
  return new Date(tSec * 1000).toISOString().slice(0, 10)
}

const rawDir = (dir: string) => join(dir, 'raw')
const rawFile = (dir: string, day: string) => join(rawDir(dir), `${day}.jsonl`)

export async function appendSamples(dir: string, samples: Sample[]): Promise<void> {
  if (samples.length === 0) return
  await mkdir(rawDir(dir), { recursive: true })
  const porDia = new Map<string, Sample[]>()
  for (const s of samples) {
    const k = dayKey(s.t)
    porDia.set(k, [...(porDia.get(k) ?? []), s])
  }
  for (const [day, filas] of porDia) {
    await appendFile(rawFile(dir, day), filas.map((f) => JSON.stringify(f)).join('\n') + '\n', 'utf8')
  }
}

export async function readDay(dir: string, day: string): Promise<Sample[]> {
  let txt: string
  try {
    txt = await readFile(rawFile(dir, day), 'utf8')
  } catch {
    return []
  }
  const out: Sample[] = []
  for (const linea of txt.split('\n')) {
    if (!linea.trim()) continue
    try {
      out.push(JSON.parse(linea) as Sample)
    } catch {
      // una línea rota no puede costar el día entero
    }
  }
  return out
}

export async function readRecent(dir: string, days: number, nowSec: number): Promise<Sample[]> {
  const out: Sample[] = []
  for (let i = days - 1; i >= 0; i--) {
    out.push(...(await readDay(dir, dayKey(nowSec - i * DAY))))
  }
  return out
}

export function summarize(day: string, samples: Sample[]): DailySummary[] {
  const porSimbolo = new Map<string, Sample[]>()
  for (const s of samples) porSimbolo.set(s.symbol, [...(porSimbolo.get(s.symbol) ?? []), s])

  return [...porSimbolo.entries()].map(([symbol, filas]) => {
    const ord = [...filas].sort((a, b) => a.t - b.t)
    const gaps = ord.map((f) => f.gapPct)
    return {
      day,
      symbol,
      n: ord.length,
      open: gaps[0],
      close: gaps[gaps.length - 1],
      min: Math.min(...gaps),
      max: Math.max(...gaps),
      median: median(gaps),
      liquidityUsd: ord[ord.length - 1].liquidityUsd,
    }
  })
}

export async function compactDay(dir: string, day: string): Promise<DailySummary[]> {
  const resumen = summarize(day, await readDay(dir, day))
  if (resumen.length === 0) return []
  await mkdir(join(dir, 'daily'), { recursive: true })
  const mes = day.slice(0, 7)
  await appendFile(
    join(dir, 'daily', `${mes}.jsonl`),
    resumen.map((r) => JSON.stringify(r)).join('\n') + '\n',
    'utf8',
  )
  return resumen
}

export async function pruneRaw(dir: string, keepDays: number, nowSec: number): Promise<string[]> {
  let archivos: string[]
  try {
    archivos = await readdir(rawDir(dir))
  } catch {
    return []
  }
  const corte = dayKey(nowSec - (keepDays - 1) * DAY)
  const borrados: string[] = []
  for (const f of archivos) {
    if (!f.endsWith('.jsonl')) continue
    const day = f.slice(0, -6)
    if (day < corte) {
      await rm(join(rawDir(dir), f))
      borrados.push(day)
    }
  }
  return borrados.sort()
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/store/jsonl.test.ts`
Expected: PASS — 10 tests

- [ ] **Step 5: Commit**

```bash
git add src/store/jsonl.ts src/store/jsonl.test.ts
git commit -m "feat(store): archivo JSONL con resumen diario y poda del crudo"
```

---

### Task 8: `poller` — la orquestación y el cron

**Files:**
- Create: `src/poller/run.ts`
- Create: `src/poller/cli.ts`
- Create: `.github/workflows/poll.yml`
- Test: `src/poller/run.test.ts`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: `type PollDeps` · `pollOnce(deps: PollDeps): Promise<PollResult>` con `type PollResult = { samples: Sample[]; skippedNoPair: string[]; skippedIlliquid: string[]; failedEquity: string[] }`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/poller/run.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { EquityQuote, OnchainQuote, StockToken } from '../core/types.js'
import { pollOnce } from './run.js'

const T = 1788239520
const meta = {
  regularMarketTime: 1788206401,
  exchangeTimezoneName: 'America/New_York',
  regular: { start: 1788269400, end: 1788292800 },
}
const tok = (symbol: string): StockToken => ({ symbol, address: `0x${symbol}`, name: `${symbol} \u2022 Robinhood Token` })
const onchain = (symbol: string, priceUsd: number, liquidityUsd: number): OnchainQuote => ({
  symbol, address: `0x${symbol}`, pairAddress: `0xp${symbol}`, priceUsd, liquidityUsd, volume24h: 1,
})

const deps = (over: Partial<Parameters<typeof pollOnce>[0]> = {}) => ({
  listStockTokens: async () => [tok('NVDA'), tok('COIN'), tok('MICRO'), tok('HOOD')],
  quoteTokens: async () => [onchain('NVDA', 220.31, 5270875), onchain('COIN', 186.49, 56787), onchain('MICRO', 1, 900)],
  equity: {
    quote: async (symbol: string): Promise<EquityQuote> => ({
      symbol, price: symbol === 'NVDA' ? 220.78 : 188.12, meta,
    }),
  },
  now: () => T,
  minLiquidityUsd: 25000,
  ...over,
})

describe('pollOnce', () => {
  it('produce una muestra por ticker líquido, con el gap real', async () => {
    const r = await pollOnce(deps())
    expect(r.samples.map((s) => s.symbol).sort()).toEqual(['COIN', 'NVDA'])
    const nvda = r.samples.find((s) => s.symbol === 'NVDA')!
    expect(nvda.gapPct).toBeCloseTo(-0.2129, 4)
    expect(nvda.status).toBe('closed')
    expect(nvda.t).toBe(T)
  })

  it('informa qué dejó afuera y por qué, en vez de callarlo', async () => {
    const r = await pollOnce(deps())
    expect(r.skippedNoPair).toEqual(['HOOD'])
    expect(r.skippedIlliquid).toEqual(['MICRO'])
  })

  it('un ticker que falla en equity no mata la corrida', async () => {
    const r = await pollOnce(deps({
      equity: {
        quote: async (symbol: string) => {
          if (symbol === 'COIN') throw new Error('429')
          return { symbol, price: 220.78, meta }
        },
      },
    }))
    expect(r.samples.map((s) => s.symbol)).toEqual(['NVDA'])
    expect(r.failedEquity).toEqual(['COIN'])
  })

  it('marca el estado abierto cuando la sesión está en curso', async () => {
    const r = await pollOnce(deps({ now: () => 1788280000 }))
    expect(r.samples.every((s) => s.status === 'open')).toBe(true)
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/poller/run.test.ts`
Expected: FAIL — `Failed to resolve import "./run.js"`

- [ ] **Step 3: Implementar el mínimo**

Crear `src/poller/run.ts`:

```ts
import { gapPct } from '../core/gap.js'
import { marketState } from '../core/session.js'
import type { EquityQuote, OnchainQuote, Sample, StockToken } from '../core/types.js'
import { watchlist } from '../core/universe.js'

export type PollDeps = {
  listStockTokens: () => Promise<StockToken[]>
  quoteTokens: (tokens: StockToken[]) => Promise<OnchainQuote[]>
  equity: { quote: (symbol: string) => Promise<EquityQuote> }
  now: () => number
  minLiquidityUsd: number
}

export type PollResult = {
  samples: Sample[]
  skippedNoPair: string[]
  skippedIlliquid: string[]
  failedEquity: string[]
}

export async function pollOnce(deps: PollDeps): Promise<PollResult> {
  const t = deps.now()
  const tokens = await deps.listStockTokens()
  const quotes = await deps.quoteTokens(tokens)

  const conPar = new Set(quotes.map((q) => q.symbol))
  const skippedNoPair = tokens.map((x) => x.symbol).filter((s) => !conPar.has(s))

  const liquidos = watchlist(quotes, deps.minLiquidityUsd)
  const enLista = new Set(liquidos.map((q) => q.symbol))
  const skippedIlliquid = quotes.map((q) => q.symbol).filter((s) => !enLista.has(s))

  const samples: Sample[] = []
  const failedEquity: string[] = []

  for (const q of liquidos) {
    try {
      const eq = await deps.equity.quote(q.symbol)
      samples.push({
        t,
        symbol: q.symbol,
        onchain: q.priceUsd,
        reference: eq.price,
        gapPct: gapPct(q.priceUsd, eq.price),
        liquidityUsd: q.liquidityUsd,
        volume24h: q.volume24h,
        status: marketState(eq.meta, t).status,
      })
    } catch {
      failedEquity.push(q.symbol)
    }
  }

  return { samples, skippedNoPair, skippedIlliquid, failedEquity }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/poller/run.test.ts`
Expected: PASS — 4 tests

- [ ] **Step 5: Escribir el entry point real**

Crear `src/poller/cli.ts`:

```ts
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
```

- [ ] **Step 6: Correr el poller de verdad una vez**

Run:

```bash
npx tsx src/poller/cli.ts
```

(Si `tsx` no está: `npm i -D tsx`.)
Expected: imprime `muestras=N ...` con N ≥ 20, y aparece `data/raw/<hoy>.jsonl` con una línea por ticker. Verificar a ojo que un `gapPct` esté en el orden de ±1 %, no de ±100 % (un gap gigante significa que se cruzaron los precios).

- [ ] **Step 7: Escribir el workflow**

Crear `.github/workflows/poll.yml`:

```yaml
name: poll

on:
  schedule:
    - cron: '*/15 * * * *'
  workflow_dispatch:

concurrency:
  group: poll
  cancel-in-progress: false

permissions:
  contents: write

jobs:
  poll:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx tsx src/poller/cli.ts
      - name: commit de la muestra
        run: |
          git config user.name  "afterhours-poller"
          git config user.email "poller@users.noreply.github.com"
          git add data/
          git diff --staged --quiet || git commit -m "data: muestra $(date -u +%FT%TZ)"
          git pull --rebase --autostash
          git push
```

- [ ] **Step 8: Commit**

```bash
git add src/poller/ .github/workflows/poll.yml
git commit -m "feat(poller): corrida completa y cron de 15 min en GitHub Actions"
```

---

### Task 9: La página — el tablero y el papel como reloj

**Files:**
- Create: `src/app/api/board/route.ts`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/theme.css`
- Create: `src/core/board.ts`
- Test: `src/core/board.test.ts`
- Modify: `package.json` (dependencias y scripts de Next)

**Interfaces:**
- Consumes: `robustZ`, `calibration` (Task 1) · `marketState`, `paperPhase` (Task 2) · `readRecent` (Task 7).
- Produces: `buildBoard(samples: Sample[], latest: Sample[], nowSec: number): Board` con `type BoardRow = { symbol: string; gapPct: number; z: number | null; calibrating: boolean; progress: number; liquidityUsd: number }` y `type Board = { rows: BoardRow[]; samples: number }`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/core/board.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Sample } from './types.js'
import { buildBoard } from './board.js'
import { MIN_SAMPLES } from './gap.js'

const T = 1788239520
const s = (symbol: string, gapPct: number, t = T): Sample => ({
  t, symbol, onchain: 100, reference: 100, gapPct,
  liquidityUsd: symbol === 'NVDA' ? 5270875 : 56787, volume24h: 0, status: 'closed',
})

describe('buildBoard', () => {
  it('marca calibrando y no publica z cuando falta historia', () => {
    const b = buildBoard([s('NVDA', -0.2)], [s('NVDA', -0.2)], T)
    expect(b.rows[0]).toMatchObject({ symbol: 'NVDA', z: null, calibrating: true })
    expect(b.rows[0].progress).toBeCloseTo(1 / MIN_SAMPLES, 6)
  })

  it('publica el z cuando hay historia suficiente', () => {
    const hist = Array.from({ length: MIN_SAMPLES }, (_, i) => s('NVDA', i % 2 === 0 ? -0.3 : -0.1, T - i * 900))
    const b = buildBoard(hist, [s('NVDA', -0.9)], T)
    expect(b.rows[0].calibrating).toBe(false)
    expect(b.rows[0].z).toBeCloseTo(-4.72, 2)
  })

  it('ordena por anomalía y no por magnitud bruta', () => {
    const hist = [
      ...Array.from({ length: MIN_SAMPLES }, (_, i) => s('NVDA', i % 2 === 0 ? -0.02 : 0.02, T - i * 900)),
      ...Array.from({ length: MIN_SAMPLES }, (_, i) => s('COIN', i % 2 === 0 ? -0.9 : -0.7, T - i * 900)),
    ]
    // COIN tiene el gap más grande, pero es su estado normal; el raro es NVDA.
    const b = buildBoard(hist, [s('NVDA', -0.30), s('COIN', -0.85)], T)
    expect(b.rows.map((r) => r.symbol)).toEqual(['NVDA', 'COIN'])
  })

  it('los que todavía calibran van después de los que tienen z', () => {
    const hist = Array.from({ length: MIN_SAMPLES }, (_, i) => s('NVDA', i % 2 === 0 ? -0.3 : -0.1, T - i * 900))
    const b = buildBoard([...hist, s('COIN', -0.8)], [s('COIN', -0.8), s('NVDA', -0.9)], T)
    expect(b.rows.map((r) => r.symbol)).toEqual(['NVDA', 'COIN'])
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/core/board.test.ts`
Expected: FAIL — `Failed to resolve import "./board.js"`

- [ ] **Step 3: Implementar el mínimo**

Crear `src/core/board.ts`:

```ts
import { calibration, robustZ } from './gap.js'
import type { Sample } from './types.js'

export type BoardRow = {
  symbol: string
  gapPct: number
  z: number | null
  calibrating: boolean
  progress: number
  liquidityUsd: number
}

export type Board = { rows: BoardRow[]; samples: number }

export function buildBoard(history: Sample[], latest: Sample[], _nowSec: number): Board {
  const porSimbolo = new Map<string, number[]>()
  for (const h of history) porSimbolo.set(h.symbol, [...(porSimbolo.get(h.symbol) ?? []), h.gapPct])

  const rows: BoardRow[] = latest.map((l) => {
    const serie = porSimbolo.get(l.symbol) ?? []
    const { ready, progress } = calibration(serie.length)
    return {
      symbol: l.symbol,
      gapPct: l.gapPct,
      z: robustZ(l.gapPct, serie),
      calibrating: !ready,
      progress,
      liquidityUsd: l.liquidityUsd,
    }
  })

  // Primero lo anómalo; lo que todavía calibra va al final, nunca mezclado.
  rows.sort((a, b) => {
    if (a.calibrating !== b.calibrating) return a.calibrating ? 1 : -1
    return Math.abs(b.z ?? 0) - Math.abs(a.z ?? 0)
  })

  return { rows, samples: history.length }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/core/board.test.ts`
Expected: PASS — 4 tests

- [ ] **Step 5: Instalar Next y montar la ruta del tablero**

```bash
npm i next react react-dom
npm i -D @types/react @types/react-dom
```

Agregar a los scripts de `package.json`: `"dev": "next dev"`, `"build": "next build"`, `"start": "next start"`.

Crear `src/app/api/board/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { buildBoard } from '../../../core/board.js'
import { marketState, paperPhase } from '../../../core/session.js'
import { readRecent } from '../../../store/jsonl.js'
import { yahooEquitySource } from '../../../sources/equity.js'

export const revalidate = 60

export async function GET() {
  const now = Math.floor(Date.now() / 1000)
  const history = await readRecent('data', 14, now)

  const ultimoT = history.reduce((max, s) => Math.max(max, s.t), 0)
  const latest = history.filter((s) => s.t === ultimoT)

  // El reloj se ancla en SPY si está; si no, en el primer símbolo con muestra.
  const ancla = latest.find((s) => s.symbol === 'SPY')?.symbol ?? latest[0]?.symbol
  let market = null
  let phase = 'night'
  if (ancla) {
    try {
      const eq = await yahooEquitySource(fetch).quote(ancla)
      const st = marketState(eq.meta, now)
      market = { ...st, anchor: ancla }
      phase = paperPhase(st)
    } catch {
      market = null // se declara desconocido en vez de inventarlo
    }
  }

  return NextResponse.json({
    now,
    lastSampleAt: ultimoT || null,
    market,
    phase,
    board: buildBoard(history, latest, now),
  })
}
```

- [ ] **Step 6: Escribir la página con el papel como reloj**

Crear `src/app/theme.css`:

```css
/* Un par papel/tinta fijo por fase. El cambio es un corte, no una transición:
   interpolar papel y tinta en direcciones opuestas anula el contraste al cruzarse. */
:root[data-phase='day']   { --paper: #ffffff; --ink: #111111; --accent: #ccff00; }
:root[data-phase='dusk']  { --paper: #ece9e2; --ink: #111111; --accent: var(--ink); }
:root[data-phase='night'] { --paper: #111111; --ink: #f4f2ec; --accent: var(--ink); }
:root[data-phase='dawn']  { --paper: #d9d6cf; --ink: #111111; --accent: var(--ink); }

html, body {
  background: var(--paper);
  color: var(--ink);
  font-family: 'Courier Prime', ui-monospace, monospace;
  margin: 0;
}

/* Sin transición por defecto. Si alguien la agrega, que al menos no corra
   para quien pidió menos movimiento. */
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
```

Crear `src/app/layout.tsx`:

```tsx
import './theme.css'

export const metadata = {
  title: 'AFTERHOURS',
  description: 'La deriva de las acciones tokenizadas mientras Wall Street duerme.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-phase="night">
      <body>{children}</body>
    </html>
  )
}
```

Crear `src/app/page.tsx`:

```tsx
import { buildBoard } from '../core/board.js'
import { marketState, paperPhase } from '../core/session.js'
import { yahooEquitySource } from '../sources/equity.js'
import { readRecent } from '../store/jsonl.js'

export const revalidate = 60

export default async function Page() {
  const now = Math.floor(Date.now() / 1000)
  const history = await readRecent('data', 14, now)
  const ultimoT = history.reduce((max, s) => Math.max(max, s.t), 0)
  const latest = history.filter((s) => s.t === ultimoT)
  const board = buildBoard(history, latest, now)

  const ancla = latest.find((s) => s.symbol === 'SPY')?.symbol ?? latest[0]?.symbol
  let estado = null
  let phase: string = 'night'
  if (ancla) {
    try {
      const eq = await yahooEquitySource(fetch).quote(ancla)
      estado = marketState(eq.meta, now)
      phase = paperPhase(estado)
    } catch {
      estado = null
    }
  }

  return (
    <main data-phase={phase} style={{ padding: '2rem', minHeight: '100vh', background: 'var(--paper)' }}>
      <h1>AFTERHOURS</h1>
      <p>
        {estado === null
          ? 'estado del mercado: desconocido'
          : estado.status === 'open'
            ? 'WALL STREET ESTÁ ABIERTO'
            : `CERRADO HACE ${estado.hoursSinceLastTrade.toFixed(1)} H` +
              (estado.hoursUntilOpen !== null ? ` · ABRE EN ${estado.hoursUntilOpen.toFixed(1)} H` : '')}
      </p>

      {board.rows.length === 0 ? (
        <p>Todavía no hay ninguna muestra archivada.</p>
      ) : (
        <table>
          <tbody>
            {board.rows.map((r) => (
              <tr key={r.symbol}>
                <td>{r.symbol}</td>
                <td>{r.gapPct.toFixed(2)} %</td>
                <td>
                  {r.calibrating
                    ? `calibrando ${Math.round(r.progress * 100)} %`
                    : `z ${r.z!.toFixed(2)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
```

- [ ] **Step 7: Verificar que corre**

Run: `npm run build && npx vitest run`
Expected: build sin errores y **todos** los tests en verde (45 en total).

Después levantar el preview con la herramienta de navegador (no con Bash) y confirmar tres cosas: el `data-phase` del `<main>` coincide con el estado real del mercado, la tabla lista los tickers archivados, y no hay errores en consola.

- [ ] **Step 8: Commit**

```bash
git add src/app src/core/board.ts src/core/board.test.ts package.json package-lock.json
git commit -m "feat(web): tablero ordenado por anomalía y papel derivado de la sesión real"
```

---

### Task 10: Pasada visual — TOLL, lettering y el gate

Esta tarea **no se improvisa acá**: la §7 de la spec fija las restricciones y el proceso es el de la skill.

**Files:**
- Modify: `src/app/page.tsx`, `src/app/theme.css`
- Create: `public/toll/*.svg`, `public/lettering/*.svg`

- [ ] **Step 1: Invocar la skill `disenar-pagina`** con vertical **DeFi/tool** y la §7 de la spec como contrato de marca.
- [ ] **Step 2: Producir el character sheet de TOLL antes de tocar la página.** El trazo consistente es el eslabón débil de esta dirección: un personaje que deriva entre poses delata generación sin curaduría.
- [ ] **Step 3: Reemplazar los títulos por lettering a mano** (SVG) y dejar los datos en Courier Prime, texto real seleccionable.
- [ ] **Step 4: Verificar los criterios de §9** — que el estado del mercado se lea por el papel **antes** que cualquier número, y que el lime aparezca **sólo** con el mercado abierto.
- [ ] **Step 5: Juez fresco** `landing-visual-judge` (requiere OK de Jose para lanzar subagentes) y registrar la fila en `Referencias/Ledger-Builds-Web.md`.

---

## Self-review

**Cobertura de la spec:** §2 (la medición) → Tasks 1 y 2 usan los números reales como casos de test. §3 (fuentes) → Tasks 4, 5, 6. §4 instrumento 1 *EL RELOJ* → Task 2 + Task 9; instrumento 2 *gap vivo ordenado por anomalía* → Tasks 1, 9; **instrumento 3 (LA CAMPANA) no tiene tarea** — mide el *snap* de la apertura y necesita historia intradía que recién existe cuando el poller lleva días corriendo. Queda **explícitamente fuera de este plan**, no olvidado: se planifica aparte cuando haya archivo. §5 (arquitectura) → una tarea por pieza. §6 (alcance) → wallet/swap/alertas ausentes a propósito. §7 (visual) → Task 10 + constraints globales. §8 riesgos: (1) Yahoo aislado en Task 6; (3) censo con filtro testeado en Task 3; (4) poda en Task 7. **§8 riesgo 5 (latencia con mercado abierto → marcar el gap como *indicativo*) no está implementado**: el `status` se archiva por muestra pero la página todavía no lo declara. Es una línea de copy en Task 9 Step 6 que hay que agregar al construir.

**Corrección del descubrimiento:** la spec §5 dice descubrir el universo con `search?q={TICKER}/USDG` de DexScreener. **Eso no funciona** — el endpoint corta en 30 pares. El plan usa Blockscout (Task 4). Hay que enmendar §5 de la spec.

**Consistencia de tipos:** `Fetcher` y `BROWSER_HEADERS` se definen una vez en `sources/http.ts` (Task 4) y los consumen Tasks 5 y 6. `DexPair` se define en `core/universe.ts` (Task 3) y lo consume Task 5. `Sample` (Task 1) es la moneda común de store, poller y board. `median` se define en `core/gap.ts` y lo reusa `store/jsonl.ts` — sin duplicar.

**Números que son datos medidos, no inventados:** 220.31/220.78, 1788206401, 1788269400, 1788292800, 5.270.875, 56.787, 194 símbolos. Si un test falla por uno de estos, la causa es un cambio real en la fuente, no un valor mal copiado.
