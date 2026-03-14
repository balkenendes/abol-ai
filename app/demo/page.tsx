'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'

/* ── TYPES ── */
interface SalesStep { step: number; label: string; description: string; timeline: string; channel: string }
interface LinkedInProfile { name: string; title: string; company: string; location: string; why: string; signal: string }
interface GeneratedStrategy {
  summary: string
  sales_process: SalesStep[]
  linkedin_connections: LinkedInProfile[]
  landing_page: { headline: string; subheadline: string; sections: string[]; cta: string }
  whitepaper_titles: string[]
  newsletter: { subject: string; preview: string }
  reddit_groups: { name: string; members: string; why: string }[]
}

interface WizardData {
  company: string
  website: string
  icp: string
  pain_ambition: string
  solution_fit: string
  solution_pricing: string
}

/* ── CHANNEL COLORS ── */
const channelColor: Record<string, string> = {
  LinkedIn: '#0ea5e9', Email: '#f59e0b', 'Landing Page': '#a78bfa',
  'Follow-up': '#00d4aa', Meeting: '#22c55e',
}

/* ── LOADING MESSAGES ── */
const LOADING_STEPS = [
  'Analyzing your ICP...',
  'Mapping market opportunities...',
  'Finding ideal LinkedIn profiles...',
  'Crafting your sales process...',
  'Writing whitepaper concepts...',
  'Building landing page strategy...',
  'Identifying Reddit communities...',
  'Finalizing your strategy...',
]

/* ═══════════════════════════════════════════════════════════ */
export default function DemoPage() {
  const [phase, setPhase] = useState<'wizard' | 'generating' | 'results'>('wizard')
  const [step, setStep] = useState(0)
  const [loadingStep, setLoadingStep] = useState(0)
  const [strategy, setStrategy] = useState<GeneratedStrategy | null>(null)
  const [error, setError] = useState('')

  const [form, setForm] = useState<WizardData>({
    company: '', website: '', icp: '', pain_ambition: '', solution_fit: '', solution_pricing: '',
  })

  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [step])

  /* ── LOADING TICKER ── */
  useEffect(() => {
    if (phase !== 'generating') return
    const interval = setInterval(() => {
      setLoadingStep(s => (s + 1) % LOADING_STEPS.length)
    }, 1400)
    return () => clearInterval(interval)
  }, [phase])

  const set = (field: keyof WizardData, val: string) =>
    setForm(f => ({ ...f, [field]: val }))

  const canNext = () => {
    if (step === 0) return form.company.trim().length > 1
    if (step === 1) return form.icp.trim().length > 10
    if (step === 2) return form.pain_ambition.trim().length > 10 && form.solution_fit.trim().length > 5
    if (step === 3) return form.solution_pricing.trim().length > 5
    return false
  }

  const next = () => {
    if (step < 3) setStep(s => s + 1)
    else generate()
  }

  const generate = async () => {
    setPhase('generating')
    setError('')
    try {
      const res = await fetch('/api/ai/demo-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setStrategy(data)
      setPhase('results')
    } catch (e) {
      setError('Something went wrong. Please try again.')
      setPhase('wizard')
      setStep(3)
    }
  }

  /* ── WIZARD ── */
  if (phase === 'wizard') return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#0a0a0f', color: '#e2e2ef' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#1e1e2e' }}>
        <span className="font-bold text-lg">Pipe<span style={{ color: '#00d4aa' }}>loop.ai</span></span>
        <Link href="/login" className="text-xs font-semibold px-4 py-1.5 rounded-full" style={{ backgroundColor: '#00d4aa', color: '#0a0a0f' }}>
          Start free →
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-xl">
          {/* Progress */}
          <div className="flex items-center gap-2 mb-10">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="flex-1 h-0.5 rounded-full transition-all" style={{ backgroundColor: i <= step ? '#00d4aa' : '#1e1e2e' }} />
            ))}
          </div>

          {/* Step 0 — Company */}
          {step === 0 && (
            <WizardStep
              badge="01 / 04"
              title="Let's start with you."
              subtitle="We'll use this to personalize your entire sales strategy."
            >
              <Label>What is your company name?</Label>
              <Input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                value={form.company}
                onChange={e => set('company', e.target.value)}
                placeholder="e.g. Momentum Software"
                onKeyDown={e => e.key === 'Enter' && canNext() && next()}
              />
              <Label>Company website (optional)</Label>
              <Input
                value={form.website}
                onChange={e => set('website', e.target.value)}
                placeholder="e.g. momentumsoftware.nl"
                onKeyDown={e => e.key === 'Enter' && canNext() && next()}
              />
            </WizardStep>
          )}

          {/* Step 1 — ICP */}
          {step === 1 && (
            <WizardStep
              badge="02 / 04"
              title={`Who does ${form.company || 'your company'} sell to?`}
              subtitle="Describe your ideal client as specifically as possible."
            >
              <Label>Ideal client persona</Label>
              <Textarea
                ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                value={form.icp}
                onChange={e => set('icp', e.target.value)}
                placeholder="e.g. Operations Directors at B2B SaaS companies with 50–200 employees in DACH and Benelux, managing teams of 5+ people"
                rows={4}
              />
            </WizardStep>
          )}

          {/* Step 2 — Pain + Solution fit */}
          {step === 2 && (
            <WizardStep
              badge="03 / 04"
              title="What keeps them up at night?"
              subtitle="Tell us their ambition and what's blocking them — then what you offer."
            >
              <Label>Their ambition & what's holding them back</Label>
              <Textarea
                ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                value={form.pain_ambition}
                onChange={e => set('pain_ambition', e.target.value)}
                placeholder="e.g. They want to scale without hiring more people, but every new client adds 5 hours of manual ops work per week. No visibility, no automation."
                rows={3}
              />
              <Label>The solution that fits their need</Label>
              <Textarea
                value={form.solution_fit}
                onChange={e => set('solution_fit', e.target.value)}
                placeholder="e.g. A single platform that automates project tracking, client reporting, and team capacity — no more spreadsheets."
                rows={3}
              />
            </WizardStep>
          )}

          {/* Step 3 — Solution + Pricing */}
          {step === 3 && (
            <WizardStep
              badge="04 / 04"
              title="Your solution & pricing."
              subtitle="What exactly do you sell, and what does it cost?"
            >
              <Label>Solution name & pricing</Label>
              <Textarea
                ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                value={form.solution_pricing}
                onChange={e => set('solution_pricing', e.target.value)}
                placeholder="e.g. Momentum Pro — €799/mo for up to 10 users. Includes project automation, client reporting, and integrations with Salesforce, HubSpot, Jira. 14-day free trial."
                rows={4}
              />
              {error && <p className="text-sm mt-2" style={{ color: '#ef4444' }}>{error}</p>}
            </WizardStep>
          )}

          {/* Nav */}
          <div className="flex items-center justify-between mt-8">
            {step > 0 ? (
              <button onClick={() => setStep(s => s - 1)} className="text-sm px-4 py-2 rounded-lg" style={{ color: '#6b6b80' }}>
                ← Back
              </button>
            ) : <div />}
            <button
              onClick={next}
              disabled={!canNext()}
              className="flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-xl transition-all disabled:opacity-30"
              style={{ backgroundColor: '#00d4aa', color: '#0a0a0f' }}
            >
              {step < 3 ? 'Next →' : '✦ Generate my strategy'}
            </button>
          </div>

          <p className="text-xs text-center mt-6" style={{ color: '#44445a' }}>
            No account needed · Powered by Claude AI · Results in ~10 seconds
          </p>
        </div>
      </main>
    </div>
  )

  /* ── GENERATING ── */
  if (phase === 'generating') return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ backgroundColor: '#0a0a0f', color: '#e2e2ef' }}>
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'rgba(0,212,170,0.1)', border: '1px solid rgba(0,212,170,0.2)' }}>
          <span className="text-2xl animate-spin" style={{ display: 'inline-block' }}>✦</span>
        </div>
        <h2 className="text-xl font-bold mb-2">Building your strategy</h2>
        <p className="text-sm mb-8" style={{ color: '#6b6b80' }}>
          Pipeloop AI is generating a personalized sales system for <span style={{ color: '#00d4aa' }}>{form.company}</span>
        </p>
        <div className="space-y-2">
          {LOADING_STEPS.map((msg, i) => (
            <div
              key={i}
              className="flex items-center gap-3 text-sm px-4 py-2.5 rounded-lg transition-all"
              style={{
                backgroundColor: i === loadingStep ? 'rgba(0,212,170,0.08)' : 'transparent',
                color: i < loadingStep ? '#44445a' : i === loadingStep ? '#00d4aa' : '#44445a',
              }}
            >
              <span style={{ color: i < loadingStep ? '#22c55e' : i === loadingStep ? '#00d4aa' : '#1e1e2e' }}>
                {i < loadingStep ? '✓' : i === loadingStep ? '→' : '○'}
              </span>
              {msg}
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  /* ── RESULTS ── */
  if (!strategy) return null
  const s = strategy

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0f', color: '#e2e2ef' }}>
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-6 py-3 border-b" style={{ backgroundColor: '#0d0d14', borderColor: '#1e1e2e' }}>
        <div className="flex items-center gap-3">
          <span className="font-bold">Pipe<span style={{ color: '#00d4aa' }}>loop.ai</span></span>
          <span className="text-xs px-2.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(0,212,170,0.1)', color: '#00d4aa', border: '1px solid rgba(0,212,170,0.2)' }}>
            Strategy for {form.company}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { setPhase('wizard'); setStep(0) }} className="text-xs" style={{ color: '#6b6b80' }}>
            ← Start over
          </button>
          <Link href="/login" className="text-xs font-semibold px-4 py-1.5 rounded-full" style={{ backgroundColor: '#00d4aa', color: '#0a0a0f' }}>
            Start free trial →
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">

        {/* ── SUMMARY ── */}
        <section className="rounded-2xl border p-6" style={{ backgroundColor: '#111118', borderColor: '#1e1e2e' }}>
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-lg" style={{ backgroundColor: 'rgba(0,212,170,0.1)' }}>✦</div>
            <div>
              <h2 className="font-bold mb-2">Your sales opportunity</h2>
              <p className="text-sm leading-relaxed" style={{ color: '#a0a0b0' }}>{s.summary}</p>
            </div>
          </div>
        </section>

        {/* ── SALES PROCESS ── */}
        <section>
          <SectionHeader icon="🎯" label="Recommended sales process" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {s.sales_process.map(step => (
              <div key={step.step} className="rounded-xl border p-4 relative" style={{ backgroundColor: '#111118', borderColor: '#1e1e2e' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: (channelColor[step.channel] || '#6b6b80') + '20', color: channelColor[step.channel] || '#6b6b80' }}>
                    {step.channel}
                  </span>
                  <span className="text-xs" style={{ color: '#44445a' }}>Step {step.step}</span>
                </div>
                <p className="text-sm font-semibold mb-1">{step.label}</p>
                <p className="text-xs leading-relaxed mb-2" style={{ color: '#6b6b80' }}>{step.description}</p>
                <p className="text-xs" style={{ color: '#44445a' }}>{step.timeline}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="grid lg:grid-cols-2 gap-8">

          {/* ── LINKEDIN CONNECTIONS ── */}
          <section>
            <SectionHeader icon="💼" label="Possible LinkedIn connections" sub="Based on your ICP — these profiles match exactly" />
            <div className="space-y-3">
              {s.linkedin_connections.map((p, i) => (
                <div key={i} className="rounded-xl border p-4" style={{ backgroundColor: '#111118', borderColor: '#1e1e2e' }}>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-xs font-bold" style={{ backgroundColor: 'rgba(14,165,233,0.1)', color: '#0ea5e9' }}>
                      {p.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('')}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{p.name}</p>
                      <p className="text-xs" style={{ color: '#6b6b80' }}>{p.title} · {p.company}</p>
                      <p className="text-xs" style={{ color: '#44445a' }}>{p.location}</p>
                    </div>
                  </div>
                  <p className="text-xs mt-3 leading-relaxed" style={{ color: '#a0a0b0' }}>{p.why}</p>
                  <div className="mt-2 text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: 'rgba(14,165,233,0.06)', color: '#0ea5e9', border: '1px solid rgba(14,165,233,0.15)' }}>
                    🔥 {p.signal}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="space-y-8">

            {/* ── LANDING PAGE ── */}
            <section>
              <SectionHeader icon="🌐" label="Landing page strategy" />
              <div className="rounded-xl border p-5" style={{ backgroundColor: '#111118', borderColor: '#1e1e2e' }}>
                <h3 className="font-bold text-base leading-snug mb-1">{s.landing_page.headline}</h3>
                <p className="text-sm mb-4" style={{ color: '#6b6b80' }}>{s.landing_page.subheadline}</p>
                <div className="space-y-1.5 mb-4">
                  {s.landing_page.sections.map((sec, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs" style={{ color: '#6b6b80' }}>
                      <span style={{ color: '#00d4aa' }}>→</span> {sec}
                    </div>
                  ))}
                </div>
                <div className="text-xs font-mono px-3 py-1.5 rounded" style={{ backgroundColor: '#1a1a24', color: '#00d4aa' }}>
                  client.pipeloop.ai/{form.company.toLowerCase().replace(/\s+/g, '-')}/[prospect-name]
                </div>
              </div>
            </section>

            {/* ── WHITEPAPER TITLES ── */}
            <section>
              <SectionHeader icon="📄" label="Whitepaper concepts" sub="AI generates the full document per prospect" />
              <div className="space-y-3">
                {s.whitepaper_titles.map((title, i) => (
                  <div key={i} className="rounded-xl border p-4 flex items-start gap-3" style={{ backgroundColor: '#111118', borderColor: '#1e1e2e' }}>
                    <span className="text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}>
                      {i + 1}
                    </span>
                    <p className="text-sm font-medium leading-snug">{title}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* ── NEWSLETTER ── */}
            <section>
              <SectionHeader icon="✉️" label="Welcome newsletter — Email 1" />
              <div className="rounded-xl border p-5" style={{ backgroundColor: '#111118', borderColor: '#1e1e2e' }}>
                <div className="text-xs px-3 py-1.5 rounded mb-3 font-mono" style={{ backgroundColor: '#1a1a24', color: '#f59e0b' }}>
                  Subject: {s.newsletter.subject}
                </div>
                <p className="text-sm leading-relaxed" style={{ color: '#a0a0b0' }}>{s.newsletter.preview}</p>
              </div>
            </section>

            {/* ── REDDIT GROUPS ── */}
            <section>
              <SectionHeader icon="🔴" label="Reddit communities" sub="Where your ICP spends time" />
              <div className="space-y-2">
                {s.reddit_groups.map((r, i) => (
                  <div key={i} className="rounded-xl border p-3 flex items-start gap-3" style={{ backgroundColor: '#111118', borderColor: '#1e1e2e' }}>
                    <span className="text-sm font-bold shrink-0" style={{ color: '#ff4500' }}>r/</span>
                    <div>
                      <p className="text-sm font-semibold">{r.name.replace('r/', '')}</p>
                      <p className="text-xs" style={{ color: '#6b6b80' }}>{r.members} members · {r.why}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        {/* ── CTAs ── */}
        <section className="rounded-2xl border p-8 text-center" style={{ backgroundColor: '#111118', borderColor: 'rgba(0,212,170,0.2)', background: 'linear-gradient(135deg, #111118 0%, rgba(0,212,170,0.04) 100%)' }}>
          <h2 className="text-2xl font-bold mb-2">Ready to run this on autopilot?</h2>
          <p className="text-sm mb-8 max-w-md mx-auto" style={{ color: '#6b6b80' }}>
            Pipeloop executes this entire strategy automatically — finding leads, sending LinkedIn messages, generating whitepapers, and booking meetings while you sleep.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="https://calendly.com/sam-balkenende/30min"
              target="_blank"
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all"
              style={{ backgroundColor: '#00d4aa', color: '#0a0a0f' }}
            >
              📅 Book a 30-min demo call
            </Link>
            <Link
              href="/login"
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all"
              style={{ backgroundColor: '#1a1a24', color: '#e2e2ef', border: '1px solid #1e1e2e' }}
            >
              🚀 Start 14-day free trial
            </Link>
          </div>
          <p className="text-xs mt-4" style={{ color: '#44445a' }}>No credit card · Cancel anytime · Live in 30 minutes</p>
        </section>

        <div className="pb-8" />
      </div>
    </div>
  )
}

/* ── SMALL COMPONENTS ── */
function WizardStep({ badge, title, subtitle, children }: { badge: string; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold mb-4" style={{ color: '#00d4aa' }}>{badge}</p>
      <h1 className="text-2xl font-bold mb-1.5">{title}</h1>
      <p className="text-sm mb-8" style={{ color: '#6b6b80' }}>{subtitle}</p>
      <div className="space-y-5">{children}</div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: '#6b6b80' }}>{children}</p>
}

const Input = ({ ref, value, onChange, placeholder, onKeyDown }: {
  ref?: React.RefObject<HTMLInputElement>
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder: string
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}) => (
  <input
    ref={ref}
    value={value}
    onChange={onChange}
    onKeyDown={onKeyDown}
    placeholder={placeholder}
    className="w-full text-sm px-4 py-3 rounded-xl outline-none transition-all"
    style={{ backgroundColor: '#111118', border: '1px solid #1e1e2e', color: '#e2e2ef' }}
  />
)

const Textarea = ({ ref, value, onChange, placeholder, rows = 3 }: {
  ref?: React.RefObject<HTMLTextAreaElement>
  value: string
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  placeholder: string
  rows?: number
}) => (
  <textarea
    ref={ref}
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    rows={rows}
    className="w-full text-sm px-4 py-3 rounded-xl outline-none resize-none transition-all"
    style={{ backgroundColor: '#111118', border: '1px solid #1e1e2e', color: '#e2e2ef' }}
  />
)

function SectionHeader({ icon, label, sub }: { icon: string; label: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-base">{icon}</span>
      <div>
        <h3 className="font-semibold text-sm">{label}</h3>
        {sub && <p className="text-xs" style={{ color: '#44445a' }}>{sub}</p>}
      </div>
    </div>
  )
}
