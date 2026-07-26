import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'LLM Tracker',
  description: 'See what ChatGPT, Claude, Gemini, Perplexity, and Grok say about your brand.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto max-w-5xl px-6 py-10">
          <header className="mb-12 flex items-baseline justify-between border-b border-line pb-5">
            <a href="/" className="text-lg font-semibold tracking-tight">
              LLM Tracker
            </a>
            <span className="label">Brand visibility in AI answers</span>
          </header>
          {children}
          <footer className="mt-20 border-t border-line pt-5">
            <p className="label">
              Built at The Workflow session &middot; Next.js + Supabase + Vercel AI Gateway
            </p>
          </footer>
        </div>
      </body>
    </html>
  )
}
