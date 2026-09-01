/** @type {import('next').NextConfig} */
export default {
  // El poller escribe data/ en el repo; la página lo lee del filesystem en build/ISR.
  outputFileTracingIncludes: { '/': ['./data/**'] },
}
