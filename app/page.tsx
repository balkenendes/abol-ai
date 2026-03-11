'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LandingPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    setLoading(false)
    if (authError) {
      setError(authError.message)
    } else {
      setSent(true)
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0f', color: '#ffffff' }}>
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 max-w-6xl mx-auto">
        <span className="text-xl font-bold">
          Pipe<span style={{ color: '#00d4aa' }}>loop.ai</span>
        </span>
        <a
          href="https://calendly.com/sam-balkenende/30min"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm px-4 py-2 rounded-lg border transition-colors"
          style={{ borderColor: '#222233', color: '#a0a0b0' }}
        >
          Book a demo
        </a>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-8 pt-20 pb-16 text-center">
        <div
          className="inline-block text-xs font-semibold px-3 py-1 rounded-full mb-6"
          style={{ backgroundColor: 'rgba(0,212,170,0.1)', color: '#00d4aa', border: '1px solid rgba(0,212,170,0.2)' }}
        >
          AI Sales Team — not a tool
        </div>

        <h1 className="text-5xl font-bold leading-tight mb-6">
          Your autonomous AI sales team.<br />
          <span style={{ color: '#00d4aa' }}>15 minutes a day.</span>
        </h1>

        <p className="text-lg mb-10 max-w-2xl mx-auto" style={{ color: '#a0a0b0' }}>
          Pipeloop finds leads, enriches them, writes personalised outreach and sends it — fully automated.
          You only review and approve. That's it.
        </p>

        {/* Email form */}
        {sent ? (
          <div
            className="inline-flex flex-col items-center gap-3 px-8 py-6 rounded-xl border"
            style={{ backgroundColor: '#111118', borderColor: '#222233' }}
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'rgba(0,212,170,0.15)' }}
            >
              <svg className="w-6 h-6" style={{ color: '#00d4aa' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="font-semibold text-white">Check your email!</p>
            <p className="text-sm" style={{ color: '#a0a0b0' }}>
              Magic link sent to <span className="text-white">{email}</span>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@company.com"
              required
              className="flex-1 px-4 py-3 rounded-lg text-white placeholder:text-[#555566] outline-none"
              style={{ backgroundColor: '#111118', border: '1px solid #222233' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#00d4aa' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#222233' }}
            />
            <button
              type="submit"
              disabled={loading || !email}
              className="px-6 py-3 rounded-lg font-semibold text-sm transition-all disabled:opacity-50"
              style={{ backgroundColor: '#00d4aa', color: '#0a0a0f' }}
            >
              {loading ? 'Sending...' : 'Start free trial →'}
            </button>
          </form>
        )}

        {error && (
          <p className="mt-3 text-sm" style={{ color: '#f87171' }}>{error}</p>
        )}

        <p className="mt-4 text-xs" style={{ color: '#555566' }}>
          14-day free trial · No credit card · Magic link login
        </p>

        <div className="mt-4">
          <a
            href="/demo"
            className="text-sm underline transition-colors"
            style={{ color: '#555566' }}
            onMouseEnter={e => { (e.target as HTMLElement).style.color = '#a0a0b0' }}
            onMouseLeave={e => { (e.target as HTMLElement).style.color = '#555566' }}
          >
            Bekijk eerst de app →
          </a>
        </div>
      </section>

      {/* Social proof */}
      <section className="max-w-4xl mx-auto px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { value: '5 leads/day', label: 'Found and enriched automatically' },
            { value: '< 15 min', label: 'Your daily time investment' },
            { value: '€0 extra', label: 'No SDR salary needed' },
          ].map((stat) => (
            <div
              key={stat.value}
              className="rounded-xl p-6 text-center border"
              style={{ backgroundColor: '#111118', borderColor: '#222233' }}
            >
              <div className="text-3xl font-bold mb-1" style={{ color: '#00d4aa' }}>{stat.value}</div>
              <div className="text-sm" style={{ color: '#a0a0b0' }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-8 py-12">
        <h2 className="text-2xl font-bold text-center mb-10">How it works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
          {[
            { step: '1', title: 'Find', desc: 'Nova finds leads matching your ICP via Apollo.io' },
            { step: '2', title: 'Enrich', desc: 'AI enriches each lead with company + personal data' },
            { step: '3', title: 'Write', desc: 'Personalised LinkedIn + email outreach is generated' },
            { step: '4', title: 'Review', desc: 'You approve in 15 min, we send automatically' },
          ].map((item) => (
            <div key={item.step} className="text-center">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3 font-bold"
                style={{ backgroundColor: 'rgba(0,212,170,0.1)', color: '#00d4aa', border: '1px solid rgba(0,212,170,0.2)' }}
              >
                {item.step}
              </div>
              <div className="font-semibold mb-1">{item.title}</div>
              <div className="text-sm" style={{ color: '#a0a0b0' }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-4xl mx-auto px-8 py-12">
        <h2 className="text-2xl font-bold text-center mb-10">Pricing</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { name: 'Starter', price: '€799', leads: '1 lead/day', desc: 'Perfect to start' },
            { name: 'Growth', price: '€1,299', leads: '2 leads/day', desc: 'Most popular', highlight: true },
            { name: 'Scale', price: '€1,799', leads: '5 leads/day', desc: 'Maximum output' },
          ].map((plan) => (
            <div
              key={plan.name}
              className="rounded-xl p-6 border"
              style={{
                backgroundColor: plan.highlight ? 'rgba(0,212,170,0.05)' : '#111118',
                borderColor: plan.highlight ? '#00d4aa' : '#222233',
              }}
            >
              {plan.highlight && (
                <div className="text-xs font-semibold mb-3" style={{ color: '#00d4aa' }}>MOST POPULAR</div>
              )}
              <div className="text-xl font-bold mb-1">{plan.name}</div>
              <div className="text-3xl font-bold mb-1">{plan.price}<span className="text-sm font-normal" style={{ color: '#a0a0b0' }}>/mo</span></div>
              <div className="text-sm mb-4" style={{ color: '#a0a0b0' }}>{plan.leads} · {plan.desc}</div>
              <button
                onClick={() => { setEmail(''); setSent(false); document.querySelector('input[type=email]')?.scrollIntoView({ behavior: 'smooth' }) }}
                className="w-full py-2 rounded-lg text-sm font-semibold transition-all"
                style={{
                  backgroundColor: plan.highlight ? '#00d4aa' : 'transparent',
                  color: plan.highlight ? '#0a0a0f' : '#00d4aa',
                  border: plan.highlight ? 'none' : '1px solid #00d4aa',
                }}
              >
                Start free trial
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto px-8 py-10 text-center text-xs" style={{ color: '#555566', borderTop: '1px solid #222233' }}>
        <p>© 2026 Pipeloop.ai · <a href="/privacy" className="hover:text-white transition-colors">Privacy</a> · <a href="/terms" className="hover:text-white transition-colors">Terms</a></p>
      </footer>
    </div>
  )
}
