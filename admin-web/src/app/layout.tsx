import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Nurones MCP Admin',
  description: 'Context-aware MCP runtime administration interface',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
