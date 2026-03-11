'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Check, Calendar, Zap, Users, Target, Brain, Search, Send, MessageSquare } from 'lucide-react'

const AGENT_EVENTS = [
  { agent: 'Nova', color: '#00d4aa', icon: '🔍', msg: 'New lead found: Mark de Vries, Chief Commercial Officer at Coolblue' },
  { agent: 'Alexander', color: '#a78bfa', icon: '✍️', msg: 'LinkedIn message written for Mark de Vries' },
  { agent: 'Nova', color: '#00d4aa', icon: '🔍', msg: 'Lead enriched: 120 employees, €15M revenue, growing 40% year over year' },
  { agent: 'Alexander', color: '#a78bfa', icon: '📧', msg: 'Email sequence started: 4 messages scheduled over 14 days' },
  { agent: 'Nova', color: '#00d4aa', icon: '🎯', msg: 'Pain point identified: no scalable outreach structure in place' },
  { agent: 'Alexander', color: '#a78bfa', icon: '📄', msg: 'Custom whitepaper generated for Coolblue' },
  { agent: 'Nova', color: '#00d4aa', icon: '🔍', msg: 'New lead found: Lisa Bakker, Chief Marketing Officer at Bol.com' },
  { agent: 'Alexander', color: '#a78bfa', icon: '🌐', msg: 'Personalized landing page created for Lisa Bakker' },
  { agent: 'Nova', color: '#00d4aa', icon: '📊', msg: 'Score 87 out of 100 — Mark de Vries replied on LinkedIn' },
  { agent: 'Alexander', color: '#a78bfa', icon: '📅', msg: 'Calendly link sent to Mark de Vries — meeting booked' },
]

const JOURNEY_STEPS = [
  {
    icon: Target,
    color: '#00d4aa',
    title: 'Ideal Customer Profile',
    agent: null,
    agentLabel: null,
    desc: 'You define your ideal customer once: industry, role, company size.',
    output: 'Profile saved',
  },
  {
    icon: Search,
    color: '#00d4aa',
    title: 'Find leads',
    agent: 'Nova',
    agentLabel: 'Nova searches',
    desc: 'Nova scans LinkedIn daily for matching profiles. Fully automatic.',
    output: 'Mark de Vries, Chief Commercial Officer at Coolblue',
  },
  {
    icon: Brain,
    color: '#00d4aa',
    title: 'Enrich',
    agent: 'Nova',
    agentLabel: 'Nova analyses',
    desc: 'Nova enriches the lead: company size, pain points, recent activity.',
    output: '120 employees · growing 40% · no outreach system',
  },
  {
    icon: MessageSquare,
    color: '#a78bfa',
    title: 'LinkedIn',
    agent: 'Alexander',
    agentLabel: 'Alexander writes',
    desc: 'Alexander writes a personalised connection request and direct message based on the pain point.',
    output: '"Hi Mark, saw your post about scaling sales..."',
  },
  {
    icon: Send,
    color: '#a78bfa',
    title: 'Email',
    agent: 'Alexander',
    agentLabel: 'Alexander schedules',
    desc: 'A 4-step drip sequence runs in parallel — fully personalised.',
    output: '4 emails scheduled over 14 days',
  },
  {
    icon: Users,
    color: '#60a5fa',
    title: 'You review',
    agent: null,
    agentLabel: 'Your approval',
    desc: 'All messages land in your review queue. Approve in 15 minutes.',
    output: '✓ Approved — sent',
  },
  {
    icon: Zap,
    color: '#f59e0b',
    title: 'Follow-up',
    agent: 'Alexander',
    agentLabel: 'Alexander optimises',
    desc: 'Alexander analyses replies and sends follow-ups at the right moment.',
    output: 'Mark replied — score 87 out of 100',
  },
  {
    icon: Calendar,
    color: '#34d399',
    title: 'Meeting booked',
    agent: null,
    agentLabel: 'Done!',
    desc: 'Pipeloop sends a Calendly link. Mark books a demo.',
    output: '📅 Demo booked: March 13, 10:00',
  },
]

export default function LandingPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeStep, setActiveStep] = useState(0)
  const [visibleEvents, setVisibleEvents] = useState<typeof AGENT_EVENTS>([])

  useEffect(() => {
    setVisibleEvents(AGENT_EVENTS.slice(0, 3))
    let index = 3
    const interval = setInterval(() => {
      const next = AGENT_EVENTS[index % AGENT_EVENTS.length]
      setVisibleEvents(evts => [next, ...evts].slice(0, 5))
      index++
    }, 2200)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep(prev => (prev + 1) % JOURNEY_STEPS.length)
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setLoading(false)
    if (authError) setError(authError.message)
    else setSent(true)
  }

  return (
    <div style={{ backgroundColor: '#0a0a0f', color: '#ffffff', fontFamily: 'inherit' }}>

      {/* Nav */}
      <nav style={{ borderBottom: '1px solid #1a1a24' }} className="sticky top-0 z-40 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between" style={{ backgroundColor: 'rgba(10,10,15,0.92)' }}>
          <span className="text-xl font-bold">Pipe<span style={{ color: '#00d4aa' }}>loop.ai</span></span>
          <div className="flex items-center gap-4">
            <a href="/demo" className="text-sm transition-colors" style={{ color: '#a0a0b0' }}>Demo</a>
            <a
              href="https://calendly.com/sam-balkenende/30min"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm px-4 py-2 rounded-lg font-semibold transition-all"
              style={{ backgroundColor: 'rgba(0,212,170,0.12)', color: '#00d4aa', border: '1px solid rgba(0,212,170,0.25)' }}
            >
              Book a demo
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-12 text-center">
        <div
          className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full mb-8"
          style={{ backgroundColor: 'rgba(0,212,170,0.08)', color: '#00d4aa', border: '1px solid rgba(0,212,170,0.2)' }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#00d4aa] animate-pulse inline-block" />
          AI agents running · 2 leads found today
        </div>

        <h1 className="text-5xl sm:text-7xl font-bold leading-tight mb-6 tracking-tight">
          From ideal customer profile<br />
          <span style={{ color: '#00d4aa' }}>to booked meeting.</span>
        </h1>

        <p className="text-xl mb-3 max-w-2xl mx-auto" style={{ color: '#a0a0b0', lineHeight: '1.7' }}>
          Two AI agents — Nova and Alexander — find your ideal customers, write personalised outreach, and book meetings for you.
        </p>
        <p className="text-lg mb-10 font-semibold">
          You spend <span style={{ color: '#00d4aa' }}>15 minutes a day</span> on it.
        </p>

        {sent ? (
          <div className="inline-flex flex-col items-center gap-3 px-8 py-6 rounded-xl border mx-auto" style={{ backgroundColor: '#111118', borderColor: '#222233' }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(0,212,170,0.15)' }}>
              <Check className="w-6 h-6" style={{ color: '#00d4aa' }} />
            </div>
            <p className="font-semibold">Check your inbox!</p>
            <p className="text-sm" style={{ color: '#a0a0b0' }}>Magic link sent to <span className="text-white">{email}</span></p>
          </div>
        ) : (
          <div>
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto mb-3">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="flex-1 px-4 py-3.5 rounded-xl text-white placeholder:text-[#555566] outline-none"
                style={{ backgroundColor: '#111118', border: '1px solid #222233', fontSize: '15px' }}
                onFocus={e => { e.currentTarget.style.borderColor = '#00d4aa' }}
                onBlur={e => { e.currentTarget.style.borderColor = '#222233' }}
              />
              <button
                type="submit"
                disabled={loading || !email}
                className="px-6 py-3.5 rounded-xl font-bold text-sm transition-all disabled:opacity-50 whitespace-nowrap"
                style={{ backgroundColor: '#00d4aa', color: '#0a0a0f' }}
              >
                {loading ? 'Sending...' : 'Start free trial →'}
              </button>
            </form>
            {error && <p className="text-sm mb-2" style={{ color: '#f87171' }}>{error}</p>}
            <p className="text-xs" style={{ color: '#555566' }}>
              14 days free · No credit card ·{' '}
              <a href="/demo" style={{ color: '#a0a0b0', textDecoration: 'underline' }}>See the app first</a>
            </p>
          </div>
        )}
      </section>

      {/* Live agent activity feed */}
      <section className="max-w-4xl mx-auto px-6 pb-16">
        <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: '#0d0d14', borderColor: '#1a1a28' }}>
          <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ backgroundColor: '#111118', borderColor: '#1a1a28' }}>
            <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <div className="w-3 h-3 rounded-full bg-[#28c840]" />
            <span className="ml-3 text-xs font-mono" style={{ color: '#555566' }}>pipeloop · agent dashboard · live</span>
            <span className="ml-auto flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#00d4aa' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#00d4aa] animate-pulse inline-block" />
              RUNNING
            </span>
          </div>

          <div className="grid grid-cols-2 gap-px" style={{ backgroundColor: '#1a1a28' }}>
            <div className="px-4 py-3" style={{ backgroundColor: '#0d0d14' }}>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-[#00d4aa] animate-pulse" />
                <span className="text-xs font-bold" style={{ color: '#00d4aa' }}>NOVA</span>
                <span className="text-xs" style={{ color: '#555566' }}>· Lead Intelligence Agent</span>
              </div>
              <div className="text-xs" style={{ color: '#a0a0b0' }}>Scans LinkedIn · enriches leads · scores priority</div>
            </div>
            <div className="px-4 py-3" style={{ backgroundColor: '#0d0d14' }}>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-[#a78bfa] animate-pulse" />
                <span className="text-xs font-bold" style={{ color: '#a78bfa' }}>ALEXANDER</span>
                <span className="text-xs" style={{ color: '#555566' }}>· Outreach Agent</span>
              </div>
              <div className="text-xs" style={{ color: '#a0a0b0' }}>Writes messages · schedules follow-ups · books meetings</div>
            </div>
          </div>

          <div className="px-4 py-3 space-y-2 min-h-[160px]">
            {visibleEvents.map((evt, i) => (
              <div
                key={`${evt.msg}-${i}`}
                className="flex items-start gap-3 text-xs font-mono"
                style={{ opacity: 1 - i * 0.18, transition: 'opacity 0.5s' }}
              >
                <span style={{ color: '#333344' }}>{String(new Date().getHours()).padStart(2, '0')}:{String(Math.max(0, new Date().getMinutes() - i * 2)).padStart(2, '0')}</span>
                <span className="font-bold shrink-0" style={{ color: evt.color }}>[{evt.agent}]</span>
                <span style={{ color: i === 0 ? '#e0e0f0' : '#a0a0b0' }}>{evt.icon} {evt.msg}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Journey: ideal customer profile → booked meeting */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4">From ideal customer profile to booked meeting</h2>
          <p className="text-lg" style={{ color: '#a0a0b0' }}>Every step is automated. The agents continuously improve based on results.</p>
        </div>

        <div className="relative">
          <div
            className="absolute top-8 left-0 right-0 h-px hidden lg:block"
            style={{ background: 'linear-gradient(90deg, transparent, #1a1a28 5%, #1a1a28 95%, transparent)', zIndex: 0 }}
          />

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 relative z-10">
            {JOURNEY_STEPS.map((step, i) => {
              const Icon = step.icon
              const isActive = i === activeStep
              const isPast = i < activeStep
              return (
                <div key={step.title} className="flex flex-col items-center text-center">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3 transition-all duration-500 relative"
                    style={{
                      backgroundColor: isActive ? `${step.color}20` : isPast ? `${step.color}10` : '#111118',
                      border: `2px solid ${isActive ? step.color : isPast ? step.color + '40' : '#222233'}`,
                      boxShadow: isActive ? `0 0 20px ${step.color}30` : 'none',
                    }}
                  >
                    <Icon className="w-7 h-7 transition-all" style={{ color: isActive || isPast ? step.color : '#333344' }} />
                    {isActive && (
                      <span
                        className="absolute -top-1 -right-1 w-3 h-3 rounded-full animate-ping"
                        style={{ backgroundColor: step.color }}
                      />
                    )}
                    {step.agent && (
                      <span
                        className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 text-[9px] font-bold px-1 rounded"
                        style={{ backgroundColor: step.color, color: '#0a0a0f', whiteSpace: 'nowrap' }}
                      >
                        {step.agentLabel}
                      </span>
                    )}
                  </div>

                  <div className="font-bold text-xs mb-1 leading-tight" style={{ color: isActive ? '#ffffff' : '#a0a0b0' }}>
                    {step.title}
                  </div>

                  {isActive && (
                    <div
                      className="text-[10px] leading-relaxed rounded-lg p-2 mt-1"
                      style={{ backgroundColor: '#111118', border: `1px solid ${step.color}30`, color: '#a0a0b0', maxWidth: '120px' }}
                    >
                      {step.output}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-12 rounded-2xl p-6 border text-center" style={{ backgroundColor: 'rgba(52,211,153,0.04)', borderColor: 'rgba(52,211,153,0.2)' }}>
          <div className="text-4xl mb-3">📅</div>
          <div className="text-2xl font-bold mb-2" style={{ color: '#34d399' }}>Demo booked: March 13, 10:00</div>
          <div className="text-sm" style={{ color: '#a0a0b0' }}>Mark de Vries, Chief Commercial Officer at Coolblue · 94% ideal customer profile match · 8 touchpoints over 12 days</div>
        </div>
      </section>

      {/* Agents improve over time */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4">The agents get smarter over time</h2>
          <p className="text-lg" style={{ color: '#a0a0b0' }}>Every reply, approval and rejection teaches the agents. They optimise automatically.</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          <div className="rounded-2xl border p-6" style={{ backgroundColor: '#0d0d14', borderColor: '#1a1a28' }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ backgroundColor: 'rgba(0,212,170,0.1)', border: '1px solid rgba(0,212,170,0.2)' }}>
                🔍
              </div>
              <div>
                <div className="font-bold text-lg" style={{ color: '#00d4aa' }}>Nova</div>
                <div className="text-xs" style={{ color: '#555566' }}>Lead Intelligence Agent</div>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-[#00d4aa] animate-pulse" />
                <span className="text-xs font-semibold" style={{ color: '#00d4aa' }}>ACTIVE</span>
              </div>
            </div>

            <div className="space-y-3">
              {[
                { label: 'Leads found today', value: '3', color: '#00d4aa' },
                { label: 'Average profile match score', value: '88 / 100', color: '#00d4aa' },
                { label: 'LinkedIn profiles scanned', value: '847', color: '#a0a0b0' },
                { label: 'Pain points identified', value: '3 of 3', color: '#00d4aa' },
              ].map(m => (
                <div key={m.label} className="flex items-center justify-between text-sm">
                  <span style={{ color: '#a0a0b0' }}>{m.label}</span>
                  <span className="font-bold" style={{ color: m.color }}>{m.value}</span>
                </div>
              ))}
            </div>

            <div className="mt-5 p-3 rounded-xl text-xs" style={{ backgroundColor: '#111118', border: '1px solid #1a1a28' }}>
              <div className="font-bold mb-1" style={{ color: '#00d4aa' }}>Most recent action</div>
              <div style={{ color: '#a0a0b0' }}>🔍 Lisa Bakker (Chief Marketing Officer at Bol.com) found — score 91 out of 100. Pain point: manual lead follow-up takes 2 hours per day.</div>
            </div>
          </div>

          <div className="rounded-2xl border p-6" style={{ backgroundColor: '#0d0d14', borderColor: '#1a1a28' }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ backgroundColor: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)' }}>
                ✍️
              </div>
              <div>
                <div className="font-bold text-lg" style={{ color: '#a78bfa' }}>Alexander</div>
                <div className="text-xs" style={{ color: '#555566' }}>Outreach Agent</div>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-[#a78bfa] animate-pulse" />
                <span className="text-xs font-semibold" style={{ color: '#a78bfa' }}>ACTIVE</span>
              </div>
            </div>

            <div className="space-y-3">
              {[
                { label: 'Messages written today', value: '6', color: '#a78bfa' },
                { label: 'Approval rate', value: '83%', color: '#a78bfa' },
                { label: 'Email open rate', value: '68%', color: '#a78bfa' },
                { label: 'Meetings booked this week', value: '2', color: '#34d399' },
              ].map(m => (
                <div key={m.label} className="flex items-center justify-between text-sm">
                  <span style={{ color: '#a0a0b0' }}>{m.label}</span>
                  <span className="font-bold" style={{ color: m.color }}>{m.value}</span>
                </div>
              ))}
            </div>

            <div className="mt-5 p-3 rounded-xl text-xs" style={{ backgroundColor: '#111118', border: '1px solid #1a1a28' }}>
              <div className="font-bold mb-1" style={{ color: '#a78bfa' }}>Most recent action</div>
              <div style={{ color: '#a0a0b0' }}>📅 Calendly link sent to Mark de Vries. He booked a demo for March 13 at 10:00. Converted after 8 touchpoints.</div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="max-w-4xl mx-auto px-6 py-12 text-center">
        <h2 className="text-3xl font-bold mb-8">Sound familiar?</h2>
        <div className="grid sm:grid-cols-3 gap-5 text-left">
          {[
            { title: 'Too expensive', desc: 'A good sales development representative costs €5,000–€8,000 per month. And they leave.' },
            { title: 'Too slow', desc: 'Finding leads, enriching them, writing messages, and sending them manually takes weeks per campaign.' },
            { title: 'Not scalable', desc: 'One sales rep reaches 50 leads per week. More reach means more people, more cost, more chaos.' },
          ].map(p => (
            <div key={p.title} className="rounded-2xl p-6 border" style={{ backgroundColor: '#111118', borderColor: '#222233' }}>
              <div className="text-lg font-bold mb-2" style={{ color: '#f87171' }}>✕ {p.title}</div>
              <p className="text-sm leading-relaxed" style={{ color: '#a0a0b0' }}>{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="max-w-4xl mx-auto px-6 py-12">
        <div className="grid grid-cols-3 gap-4">
          {[
            { value: '5 leads / day', label: 'Found and enriched automatically' },
            { value: '15 minutes', label: 'Your daily time investment' },
            { value: '€0', label: 'Extra sales salary needed' },
          ].map(s => (
            <div key={s.value} className="rounded-2xl p-6 text-center border" style={{ backgroundColor: '#111118', borderColor: '#222233' }}>
              <div className="text-3xl font-bold mb-1" style={{ color: '#00d4aa' }}>{s.value}</div>
              <div className="text-sm" style={{ color: '#a0a0b0' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-4">Pricing</h2>
        <p className="text-center mb-12" style={{ color: '#a0a0b0' }}>Cheaper than one sales hire. Runs 24 hours a day. Books meetings while you sleep.</p>
        <div className="grid sm:grid-cols-3 gap-6">
          {[
            {
              name: 'Starter', price: '€799', mo: ' / month', leads: '1 lead per day',
              features: ['Nova and Alexander active', 'LinkedIn and email outreach', 'Review queue', 'AI enrichment'],
              popular: false,
            },
            {
              name: 'Growth', price: '€1,299', mo: ' / month', leads: '2 leads per day',
              features: ['Everything in Starter', 'Whitepaper generation', 'Personalised landing pages', 'Calendly integration'],
              popular: true,
            },
            {
              name: 'Scale', price: '€1,799', mo: ' / month', leads: '5 leads per day',
              features: ['Everything in Growth', 'Multi-channel sequences', 'A/B testing', 'Priority support'],
              popular: false,
            },
          ].map(plan => (
            <div
              key={plan.name}
              className="rounded-2xl p-6 border flex flex-col"
              style={{
                backgroundColor: plan.popular ? 'rgba(0,212,170,0.04)' : '#111118',
                borderColor: plan.popular ? '#00d4aa' : '#222233',
              }}
            >
              {plan.popular && (
                <div className="text-xs font-bold mb-3" style={{ color: '#00d4aa' }}>⭐ MOST POPULAR</div>
              )}
              <div className="text-xl font-bold mb-1">{plan.name}</div>
              <div className="mb-1">
                <span className="text-4xl font-bold">{plan.price}</span>
                <span className="text-sm" style={{ color: '#a0a0b0' }}>{plan.mo}</span>
              </div>
              <div className="text-sm font-semibold mb-5" style={{ color: '#00d4aa' }}>{plan.leads}</div>
              <ul className="space-y-2.5 mb-6 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm" style={{ color: '#a0a0b0' }}>
                    <Check className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#00d4aa' }} />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => document.getElementById('cta-email')?.focus()}
                className="w-full py-3 rounded-xl font-bold text-sm transition-all"
                style={{
                  backgroundColor: plan.popular ? '#00d4aa' : 'transparent',
                  color: plan.popular ? '#0a0a0f' : '#00d4aa',
                  border: plan.popular ? 'none' : '1px solid #00d4aa',
                }}
              >
                Start free trial
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Final call to action */}
      <section className="max-w-2xl mx-auto px-6 py-20 text-center">
        <h2 className="text-4xl font-bold mb-3">Ready to start booking meetings?</h2>
        <p className="mb-8 text-lg" style={{ color: '#a0a0b0' }}>14 days free. Nova and Alexander get to work immediately.</p>
        {!sent ? (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
            <input
              id="cta-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              className="flex-1 px-4 py-3.5 rounded-xl text-white placeholder:text-[#555566] outline-none"
              style={{ backgroundColor: '#111118', border: '1px solid #222233' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#00d4aa' }}
              onBlur={e => { e.currentTarget.style.borderColor = '#222233' }}
            />
            <button
              type="submit"
              disabled={loading || !email}
              className="px-6 py-3.5 rounded-xl font-bold text-sm disabled:opacity-50 whitespace-nowrap"
              style={{ backgroundColor: '#00d4aa', color: '#0a0a0f' }}
            >
              {loading ? '...' : 'Start free →'}
            </button>
          </form>
        ) : (
          <p className="font-semibold text-lg" style={{ color: '#00d4aa' }}>✓ Check your inbox for the magic link!</p>
        )}
        {error && <p className="mt-2 text-sm" style={{ color: '#f87171' }}>{error}</p>}
        <p className="mt-4 text-sm" style={{ color: '#555566' }}>
          Want to see it first?{' '}
          <a href="/demo" style={{ color: '#a0a0b0', textDecoration: 'underline' }}>Open the interactive demo →</a>
        </p>
      </section>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto px-6 py-8 text-center text-xs" style={{ color: '#555566', borderTop: '1px solid #1a1a24' }}>
        <p>© 2026 Pipeloop.ai &nbsp;·&nbsp; <a href="/privacy" className="hover:text-white">Privacy</a> &nbsp;·&nbsp; <a href="/terms" className="hover:text-white">Terms</a> &nbsp;·&nbsp; <a href="https://calendly.com/sam-balkenende/30min" target="_blank" rel="noopener noreferrer" className="hover:text-white">Book a demo</a></p>
      </footer>
    </div>
  )
}
