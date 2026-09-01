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
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!
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
