import { appendFile, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Sample } from '../core/types'
import { appendSamples, compactDay, dayKey, parseDaily, pruneRaw, readDay, readRecent, summarize } from './jsonl'

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
  it('resume por símbolo con apertura, cierre, extremos y mediana', () => {
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
    expect(out[0]!.open).toBe(-0.2)
    expect(out[0]!.close).toBe(-0.6)
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

describe('compactDay es idempotente', () => {
  /**
   * ESTE es el test que faltaba, y su ausencia costó una de cada dos corridas del
   * poller durante dos días. `compactDay` anexaba, y como el guard que lo llamaba
   * nunca podía ser falso corría en cada corrida: `data/daily/2026-09.jsonl` llegó
   * a 3.508 líneas para 110 resúmenes reales. Ese archivo inflado conflictuaba en
   * cada rebase de la CI y el job moría con sus lecturas adentro.
   */
  it('correrlo N veces deja el MISMO archivo, byte por byte', async () => {
    const d = await dir()
    await appendSamples(d, [s(), s({ t: T + 900, gapPct: -0.6 }), s({ symbol: 'TSLA' })])
    const ruta = join(d, 'daily', '2026-09.jsonl')

    await compactDay(d, '2026-09-01')
    const primera = await readFile(ruta, 'utf8')
    await compactDay(d, '2026-09-01')
    await compactDay(d, '2026-09-01')
    const tercera = await readFile(ruta, 'utf8')

    expect(tercera).toBe(primera)
    expect(parseDaily(tercera)).toHaveLength(2)
  })

  it('no duplica una clave (día, símbolo) por más veces que corra', async () => {
    const d = await dir()
    await appendSamples(d, [s(), s({ symbol: 'TSLA' })])
    for (let i = 0; i < 5; i++) await compactDay(d, '2026-09-01')
    const filas = parseDaily(await readFile(join(d, 'daily', '2026-09.jsonl'), 'utf8'))
    const claves = filas.map((f) => `${f.day}|${f.symbol}`)
    expect(new Set(claves).size).toBe(claves.length)
  })

  it('reescribe SU día y conserva los otros del mismo mes', async () => {
    const d = await dir()
    await appendSamples(d, [s(), s({ t: T + 86400 })])
    await compactDay(d, '2026-09-01')
    await compactDay(d, '2026-09-02')

    // Llega una lectura más del 1-sep y se vuelve a cerrar ese día.
    await appendSamples(d, [s({ t: T + 900, gapPct: -5 })])
    await compactDay(d, '2026-09-01')

    const filas = parseDaily(await readFile(join(d, 'daily', '2026-09.jsonl'), 'utf8'))
    expect(filas.map((f) => f.day)).toEqual(['2026-09-01', '2026-09-02'])
    expect(filas.find((f) => f.day === '2026-09-01')).toMatchObject({ n: 2, min: -5 })
    // El 2-sep no se tocó al reescribir el 1-sep.
    expect(filas.find((f) => f.day === '2026-09-02')).toMatchObject({ n: 1 })
  })

  it('cada mes es su propio archivo: reescribir uno no puede tocar al otro', async () => {
    const d = await dir()
    await appendSamples(d, [s({ t: T - 86400 }), s()])
    await compactDay(d, '2026-08-31')
    await compactDay(d, '2026-09-01')
    await compactDay(d, '2026-09-01')

    const agosto = parseDaily(await readFile(join(d, 'daily', '2026-08.jsonl'), 'utf8'))
    const septiembre = parseDaily(await readFile(join(d, 'daily', '2026-09.jsonl'), 'utf8'))
    expect(agosto.map((f) => f.day)).toEqual(['2026-08-31'])
    expect(septiembre.map((f) => f.day)).toEqual(['2026-09-01'])
  })

  it('deja las filas en orden determinista, para que git no vea un diff falso', async () => {
    const d = await dir()
    await appendSamples(d, [s({ symbol: 'TSLA' }), s({ symbol: 'AAPL' }), s({ symbol: 'NVDA' })])
    await compactDay(d, '2026-09-01')
    const filas = parseDaily(await readFile(join(d, 'daily', '2026-09.jsonl'), 'utf8'))
    expect(filas.map((f) => f.symbol)).toEqual(['AAPL', 'NVDA', 'TSLA'])
  })
})

describe('dayKey no sirve como guard de cruce de medianoche', () => {
  /**
   * Regresión con nombre. `poller/cli.ts` tenía
   * `const ayer = dayKey(now - 86400); if (dayKey(now) !== ayer) { ... }`
   * con la intención de correr algo UNA vez por día, al cruzar la medianoche UTC.
   * La condición no puede ser falsa: restar exactamente 86.400 s siempre cae en el
   * día UTC anterior, porque UTC no tiene DST y no hay borde donde empaten.
   *
   * Se deja escrito para que nadie vuelva a leer esa forma como un guard.
   */
  it('comparar ahora contra ahora-menos-un-día SIEMPRE difiere', () => {
    const instantes = [0, 1, 1756857600, 1756857599, 1756857601, T, T + 43200, T - 43200]
    for (const t of instantes) expect(dayKey(t)).not.toBe(dayKey(t - 86400))
  })
})

describe('compactDay repara los duplicados que deja merge=union', () => {
  /**
   * `merge=union` mantiene vivo al job cuando dos corridas chocan, pero se queda
   * con las DOS puntas — y como compactDay reescribe, esas puntas pueden ser
   * versiones distintas de la misma clave. Medido en vivo el 2026-09-03: el
   * archivo publicado paso de 110 a 174 lineas con 64 claves duplicadas.
   */
  it('deduplica una clave repetida y se queda con la que vio MAS lecturas', async () => {
    const d = await dir()
    // Tres lecturas del 2-sep: el resumen bueno tiene n=3.
    await appendSamples(d, [
      s({ t: T + 86400 }),
      s({ t: T + 86400 + 900, gapPct: -1 }),
      s({ t: T + 86400 + 1800, gapPct: -2 }),
    ])
    await compactDay(d, '2026-09-02')

    // Simula lo que deja union: la misma clave dos veces. La punta perdedora es
    // la de una corrida que alcanzo a ver MENOS lecturas antes de chocar.
    const ruta = join(d, 'daily', '2026-09.jsonl')
    const buena = parseDaily(await readFile(ruta, 'utf8'))[0]!
    expect(buena.n).toBe(3)
    await appendFile(ruta, JSON.stringify({ ...buena, n: 1, close: -99 }) + '\n', 'utf8')
    expect(parseDaily(await readFile(ruta, 'utf8'))).toHaveLength(2)

    // Compactar OTRO dia igual repara al vecino duplicado.
    await appendSamples(d, [s()])
    await compactDay(d, '2026-09-01')

    const filas = parseDaily(await readFile(ruta, 'utf8'))
    const dosSep = filas.filter((f) => f.day === '2026-09-02')
    expect(dosSep).toHaveLength(1)
    expect(dosSep[0]!.n).toBe(3)
    expect(dosSep[0]!.close).not.toBe(-99)
  })

  it('la reparacion alcanza a TODOS los dias, no solo al que se compacta', async () => {
    const d = await dir()
    await appendSamples(d, [s(), s({ t: T + 86400 }), s({ t: T + 2 * 86400 })])
    await compactDay(d, '2026-09-01')
    await compactDay(d, '2026-09-02')
    await compactDay(d, '2026-09-03')

    const ruta = join(d, 'daily', '2026-09.jsonl')
    const todas = parseDaily(await readFile(ruta, 'utf8'))
    for (const f of todas) await appendFile(ruta, JSON.stringify({ ...f, n: 0 }) + '\n', 'utf8')
    expect(parseDaily(await readFile(ruta, 'utf8'))).toHaveLength(6)

    await compactDay(d, '2026-09-01')
    const filas = parseDaily(await readFile(ruta, 'utf8'))
    expect(filas).toHaveLength(3)
    expect(filas.every((f) => f.n > 0)).toBe(true)
  })
})

describe('compactDay: la fila recien calculada manda sobre SU dia', () => {
  /**
   * Cazado por un mutante que sobrevivio: sin el filtro `f.day !== day`, la
   * deduplicacion por `n` mas alto dejaba ganar a una fila VIEJA del mismo dia.
   * El desempate por `n` es para reparar duplicados de OTROS dias; para el dia
   * que se esta cerrando manda lo que dice el crudo AHORA, aunque tenga menos
   * lecturas (el crudo pudo podarse, o rotar).
   */
  it('una fila vieja con n mas alto NO le gana al resumen fresco de ese dia', async () => {
    const d = await dir()
    await appendSamples(d, [s()])
    await compactDay(d, '2026-09-01')

    const ruta = join(d, 'daily', '2026-09.jsonl')
    const fresca = parseDaily(await readFile(ruta, 'utf8'))[0]!
    expect(fresca.n).toBe(1)

    // Una version vieja del MISMO dia, inflada, se cuela en el archivo.
    await appendFile(ruta, JSON.stringify({ ...fresca, n: 999, close: -42 }) + '\n', 'utf8')

    await compactDay(d, '2026-09-01')
    const filas = parseDaily(await readFile(ruta, 'utf8'))
    expect(filas).toHaveLength(1)
    expect(filas[0]!.n).toBe(1)
    expect(filas[0]!.close).not.toBe(-42)
  })
})
