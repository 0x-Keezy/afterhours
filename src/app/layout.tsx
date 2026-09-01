import type { ReactNode } from 'react'
import { Courier_Prime } from 'next/font/google'
import './theme.css'
import { getPageState } from './state'

/* Courier Prime, autohospedada por next/font: es lo que IMPRIME LA MÁQUINA.
   Lo que escribe TOLL son trazos dibujados (lettering.tsx), no una fuente.
   Una sola familia web en toda la página. */
const mono = Courier_Prime({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
  variable: '--font-mono',
})

export const metadata = {
  title: 'AFTERHOURS',
  description:
    'The drift of Robinhood Chain tokenized stocks while Wall Street is closed. Measured every 15 minutes and archived.',
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // La fase va en <html> y no en <main>: el papel tiene que llegar también al
  // fondo del documento, o al hacer overscroll asoma un color que no es el de
  // la hora. Comparte lectura con la página vía cache(), sin pedir dos veces.
  const { phase } = await getPageState()

  return (
    <html lang="en" data-phase={phase} className={mono.variable}>
      <body>{children}</body>
    </html>
  )
}
