/** @type {import('next').NextConfig} */
export default {
  // El poller escribe data/ en el repo; la página lo lee del filesystem en build/ISR.
  // Cada ruta que lea del filesystem necesita su PROPIA entrada: el tracing es
  // por ruta, no global. '/archive' sirve el JSONL crudo y sin esto devolvía
  // vacío en producción, que es justo la evidencia que la página promete.
  outputFileTracingIncludes: {
    '/': ['./data/**'],
    '/archive': ['./data/**'],
  },
}
