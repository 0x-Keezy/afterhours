import type { ReactNode } from 'react'
import { Courier_Prime, Pixelify_Sans } from 'next/font/google'
import './theme.css'
import { getPageState } from './state'

/* Dos familias, con una razón de producto y no de gusto:
   - Pixelify Sans es el CHROME del escritorio (barras de título, wordmark, el
     estado del mercado). Es el vocabulario de la referencia de Jose.
   - Courier Prime es lo que IMPRIME LA MÁQUINA: los números del tablero, en
     texto real seleccionable e indexable.
   Silkscreen y Press Start 2P están prohibidas por uso previo en el ledger. */
const pixel = Pixelify_Sans({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
  variable: '--font-pixel',
})

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
    <html lang="en" data-phase={phase} className={`${pixel.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
