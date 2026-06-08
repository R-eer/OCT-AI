import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'OCT Vision AI',
  description: 'AI-powered OCT scan analysis for ophthalmology professionals',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className} style={{ backgroundColor: '#0a0f1e', minHeight: '100vh' }}>
        {children}
      </body>
    </html>
  )
}
