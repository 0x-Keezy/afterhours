import type { ReactNode } from 'react'
import './theme.css'

export const metadata = {
  title: 'AFTERHOURS',
  description: 'La deriva de las acciones tokenizadas mientras Wall Street duerme.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
