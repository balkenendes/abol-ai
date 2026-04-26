import type { Metadata } from 'next'
import { Inter, Instrument_Serif, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const serif = Instrument_Serif({ subsets: ['latin'], weight: ['400'], variable: '--font-serif', display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' })

export const metadata: Metadata = {
  title: 'Pipeloop — Free e-commerce diagnostic. $7,500 fixed-price rebuild.',
  description:
    'Paste your store URL. We scan the platform, the markup, the load weight, and the trust signals. Report in under 15 seconds. Then $7,500 fixed-price rebuild in 14 days, refund if we miss the date.',
  metadataBase: new URL('https://pipeloop.ai'),
  openGraph: {
    title: 'Pipeloop — Free e-commerce diagnostic',
    description:
      'Find out what your outdated store is costing you. Free audit in 15 seconds. $7,500 rebuild in 14 days, refund guarantee.',
    url: 'https://pipeloop.ai',
    siteName: 'Pipeloop',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable} ${mono.variable}`}>
      <body className={inter.className}>{children}</body>
    </html>
  )
}
