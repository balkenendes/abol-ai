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

/* ── COMPANY SIZE STEPS ── */
const SIZE_STEPS = ['1–10', '10–50', '50–200', '200–500', '500–2000', '2000+']

/* ── REGIONS (world map grid) ── */
const REGIONS = [
  { id: 'europe',    label: 'Europe',          emoji: '🌍', col: 2, row: 1 },
  { id: 'nordics',   label: 'Nordics',          emoji: '🌨',  col: 2, row: 0 },
  { id: 'uk',        label: 'UK & Ireland',     emoji: '🇬🇧', col: 1, row: 1 },
  { id: 'dach',      label: 'DACH',             emoji: '🏔',  col: 3, row: 1 },
  { id: 'northam',   label: 'North America',    emoji: '🌎', col: 0, row: 1 },
  { id: 'latam',     label: 'Latin America',    emoji: '🌴', col: 0, row: 2 },
  { id: 'mea',       label: 'Middle East & Africa', emoji: '🌍', col: 3, row: 2 },
  { id: 'apac',      label: 'Asia Pacific',     emoji: '🌏', col: 4, row: 1 },
  { id: 'global',    label: 'Global',           emoji: '🌐', col: 2, row: 2 },
]

/* ── CHANNEL COLORS ── */
const CH: Record<string, string> = {
  LinkedIn: '#0ea5e9', Email: '#f59e0b', 'Landing Page': '#a78bfa',
  'Follow-up': '#00d4aa', Meeting: '#22c55e',
}

/* ── LOADING STEPS ── */
const LOADING = [
  'Scanning LinkedIn for ICP matches…',
  'Mapping your market opportunity…',
  'Building personalized landing page…',
  'Crafting whitepaper concepts…',
  'Writing your first email sequence…',
  'Finding Reddit communities…',
  'Finalizing your sales playbook…',
]

/* ═══════════════════════════════════════════════════════════ */
export default function DemoPage() {
  const [phase, setPhase] = useState<'wizard' | 'generating' | 'results'>('wizard')
  const [loadingIdx, setLoadingIdx] = useState(0)
  const [strategy, setStrategy] = useState<GeneratedStrategy | null>(null)

  /* wizard state */
  const [company, setCompany] = useState('')
  const [researching, setResearching] = useState(false)
  const [researched, setResearched] = useState(false)
  const [website, setWebsite] = useState('')
  const [icp, setIcp] = useState('')
  const [pain, setPain] = useState('')
  const [solution, setSolution] = useState('')
  const [sizeIdx, setSizeIdx] = useState(2)
  const [region, setRegion] = useState('europe')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  /* ── LOADING TICKER ── */
  useEffect(() => {
    if (phase !== 'generating') return
    const t = setInterval(() => setLoadingIdx(i => (i + 1) % LOADING.length), 1300)
    return () => clearInterval(t)
  }, [phase])

  /* ── RESEARCH COMPANY ── */
  const research = async () => {
    if (company.trim().length < 2 || researching) return
    setResearching(true)
    try {
      const res = await fetch('/api/ai/company-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company }),
      })
      const data = await res.json()
      setWebsite(data.website || '')
      setIcp(data.icp || '')
      setPain(data.pain || '')
      setSolution(data.solution || '')
      setResearched(true)
    } catch {
      setResearched(true) // show fields anyway
    } finally {
      setResearching(false)
    }
  }

  /* ── GENERATE ── */
  const generate = async () => {
    setPhase('generating')
    try {
      const res = await fetch('/api/ai/demo-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company, website, icp, pain, solution, size: SIZE_STEPS[sizeIdx], region }),
      })
      const data = await res.json()
      setStrategy(data)
      setPhase('results')
    } catch {
      // Should never happen — API has fallback, but just in case
      setPhase('results')
    }
  }

  const canGenerate = researched && icp.trim().length > 5

  /* ────────────────────────────────────────── WIZARD ── */
  if (phase === 'wizard') return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#0a0a0f', color: '#e2e2ef' }}>
      <header className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#1e1e2e' }}>
        <span className="font-bold text-lg">Pipe<span style={{ color: '#00d4aa' }}>loop.ai</span></span>
        <Link href="/login" className="text-xs font-semibold px-4 py-1.5 rounded-full" style={{ backgroundColor: '#00d4aa', color: '#0a0a0f' }}>
          Start free →
        </Link>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 py-12 overflow-y-auto">
        <div className="w-full max-w-2xl">

          {/* ── HERO ── */}
          <div className="mb-10 text-center">
            <div className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full mb-5" style={{ backgroundColor: 'rgba(0,212,170,0.08)', color: '#00d4aa', border: '1px solid rgba(0,212,170,0.2)' }}>
              ✦ AI-powered · Results in 15 seconds · No account needed
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold mb-3 leading-tight">
              Your autonomous sales team,<br />
              <span style={{ color: '#00d4aa' }}>built in 15 seconds.</span>
            </h1>
            <p className="text-sm" style={{ color: '#6b6b80' }}>
              Type your company name. Our AI does the rest — ICP mapping, LinkedIn profiles, whitepapers, landing pages & more.
            </p>
          </div>

          {/* ── STEP 1: COMPANY NAME ── */}
          <div className="rounded-2xl border p-6 mb-4" style={{ backgroundColor: '#111118', borderColor: '#1e1e2e' }}>
            <label className="text-xs font-semibold uppercase tracking-wider mb-3 block" style={{ color: '#6b6b80' }}>
              Your company name
            </label>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={company}
                onChange={e => { setCompany(e.target.value); setResearched(false) }}
                onKeyDown={e => e.key === 'Enter' && research()}
                placeholder="e.g. Pipeloop, Salesforce, Bakker & Partners…"
                className="flex-1 text-base px-4 py-3 rounded-xl outline-none"
                style={{ backgroundColor: '#0d0d14', border: '1px solid #1e1e2e', color: '#e2e2ef' }}
              />
              <button
                onClick={research}
                disabled={company.trim().length < 2 || researching}
                className="px-5 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 whitespace-nowrap"
                style={{ backgroundColor: '#00d4aa', color: '#0a0a0f' }}
              >
                {researching ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin">⟳</span> Researching…
                  </span>
                ) : researched ? '✓ Done — edit below' : 'Research →'}
              </button>
            </div>

            {/* ── AUTO-FILLED FIELDS ── */}
            {(researching || researched) && (
              <div className="mt-5 space-y-4 pt-5 border-t" style={{ borderColor: '#1e1e2e' }}>
                {researching ? (
                  <div className="space-y-3">
                    {['Researching company…', 'Identifying ICP…', 'Analyzing pain points…', 'Mapping solution…'].map((msg, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="animate-pulse text-xs" style={{ color: '#00d4aa' }}>⟳</span>
                        <div className="h-3 rounded-full animate-pulse flex-1" style={{ backgroundColor: '#1a1a24', maxWidth: `${60 + i * 15}%` }} />
                        <span className="text-xs" style={{ color: '#44445a' }}>{msg}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-2 text-xs mb-2" style={{ color: '#00d4aa' }}>
                      <span>✦</span>
                      <span>AI filled these in — edit anything that&apos;s off</span>
                    </div>
                    <Field label="Website" value={website} onChange={setWebsite} placeholder="yourcompany.com" />
                    <Field label="Ideal client persona (ICP)" value={icp} onChange={setIcp} placeholder="Who buys from you — title, industry, company size" textarea />
                    <Field label="Their biggest pain / ambition" value={pain} onChange={setPain} placeholder="What problem do they have? What do they want?" textarea />
                    <Field label="Your solution" value={solution} onChange={setSolution} placeholder="What you sell and at what price" textarea />
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── STEP 2: SIZE + REGION ── */}
          {researched && (
            <>
              {/* Company size slider */}
              <div className="rounded-2xl border p-6 mb-4" style={{ backgroundColor: '#111118', borderColor: '#1e1e2e' }}>
                <label className="text-xs font-semibold uppercase tracking-wider mb-4 block" style={{ color: '#6b6b80' }}>
                  Target company size
                </label>
                <div className="px-2">
                  <input
                    type="range" min={0} max={5} step={1} value={sizeIdx}
                    onChange={e => setSizeIdx(Number(e.target.value))}
                    className="w-full accent-teal-400 cursor-pointer"
                    style={{ accentColor: '#00d4aa' }}
                  />
                  <div className="flex justify-between mt-2">
                    {SIZE_STEPS.map((s, i) => (
                      <span key={s} className="text-xs transition-all" style={{ color: i === sizeIdx ? '#00d4aa' : '#44445a', fontWeight: i === sizeIdx ? 700 : 400 }}>
                        {s}
                      </span>
                    ))}
                  </div>
                  <p className="text-center mt-3 text-sm font-semibold" style={{ color: '#00d4aa' }}>
                    {SIZE_STEPS[sizeIdx]} employees
                  </p>
                </div>
              </div>

              {/* Region world map */}
              <div className="rounded-2xl border p-6 mb-6" style={{ backgroundColor: '#111118', borderColor: '#1e1e2e' }}>
                <label className="text-xs font-semibold uppercase tracking-wider mb-4 block" style={{ color: '#6b6b80' }}>
                  Target region
                </label>
                <div className="grid grid-cols-5 gap-2" style={{ gridTemplateRows: 'repeat(3, auto)' }}>
                  {/* Row 0 */}
                  <div className="col-start-3 row-start-1">
                    <RegionBtn id="nordics" label="Nordics" emoji="🌨" active={region === 'nordics'} onClick={() => setRegion('nordics')} />
                  </div>
                  {/* Row 1 */}
                  <div className="col-start-1 row-start-2">
                    <RegionBtn id="northam" label="N. America" emoji="🌎" active={region === 'northam'} onClick={() => setRegion('northam')} />
                  </div>
                  <div className="col-start-2 row-start-2">
                    <RegionBtn id="uk" label="UK & IE" emoji="🇬🇧" active={region === 'uk'} onClick={() => setRegion('uk')} />
                  </div>
                  <div className="col-start-3 row-start-2">
                    <RegionBtn id="europe" label="Europe" emoji="🌍" active={region === 'europe'} onClick={() => setRegion('europe')} />
                  </div>
                  <div className="col-start-4 row-start-2">
                    <RegionBtn id="dach" label="DACH" emoji="🏔" active={region === 'dach'} onClick={() => setRegion('dach')} />
                  </div>
                  <div className="col-start-5 row-start-2">
                    <RegionBtn id="apac" label="Asia Pac" emoji="🌏" active={region === 'apac'} onClick={() => setRegion('apac')} />
                  </div>
                  {/* Row 2 */}
                  <div className="col-start-1 row-start-3">
                    <RegionBtn id="latam" label="L. America" emoji="🌴" active={region === 'latam'} onClick={() => setRegion('latam')} />
                  </div>
                  <div className="col-start-3 row-start-3">
                    <RegionBtn id="global" label="Global" emoji="🌐" active={region === 'global'} onClick={() => setRegion('global')} />
                  </div>
                  <div className="col-start-4 row-start-3">
                    <RegionBtn id="mea" label="MEA" emoji="🌍" active={region === 'mea'} onClick={() => setRegion('mea')} />
                  </div>
                </div>
              </div>

              {/* GENERATE BUTTON */}
              <button
                onClick={generate}
                disabled={!canGenerate}
                className="w-full py-4 rounded-2xl text-base font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-3"
                style={{ backgroundColor: '#00d4aa', color: '#0a0a0f' }}
              >
                <span className="text-lg">✦</span>
                Generate my autonomous sales strategy
                <span style={{ opacity: 0.7, fontWeight: 400 }}>→</span>
              </button>
              <p className="text-xs text-center mt-3" style={{ color: '#44445a' }}>
                Ready in ~15 seconds · No account · No credit card
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  )

  /* ────────────────────────────────────────── GENERATING ── */
  if (phase === 'generating') return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ backgroundColor: '#0a0a0f', color: '#e2e2ef' }}>
      <div className="text-center max-w-sm px-4">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'rgba(0,212,170,0.1)', border: '1px solid rgba(0,212,170,0.2)' }}>
          <span className="text-2xl" style={{ display: 'inline-block', animation: 'spin 2s linear infinite' }}>✦</span>
        </div>
        <h2 className="text-xl font-bold mb-1">Building your strategy</h2>
        <p className="text-sm mb-8" style={{ color: '#6b6b80' }}>
          Pipeloop AI is designing an autonomous sales system for <span style={{ color: '#00d4aa' }}>{company}</span>
        </p>
        <div className="text-left space-y-2 max-w-xs mx-auto">
          {LOADING.map((msg, i) => (
            <div key={i} className="flex items-center gap-3 text-sm py-1.5 px-3 rounded-lg transition-all" style={{
              backgroundColor: i === loadingIdx ? 'rgba(0,212,170,0.07)' : 'transparent',
              color: i < loadingIdx ? '#44445a' : i === loadingIdx ? '#e2e2ef' : '#44445a',
            }}>
              <span style={{ color: i < loadingIdx ? '#22c55e' : i === loadingIdx ? '#00d4aa' : '#2a2a3a', minWidth: 14, textAlign: 'center' }}>
                {i < loadingIdx ? '✓' : i === loadingIdx ? '→' : '·'}
              </span>
              {msg}
            </div>
          ))}
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  /* ────────────────────────────────────────── RESULTS ── */
  if (!strategy) return null
  const s = strategy
  const regionLabel = REGIONS.find(r => r.id === region)?.label || region

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0f', color: '#e2e2ef' }}>
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-6 py-3 border-b" style={{ backgroundColor: '#0d0d14', borderColor: '#1e1e2e' }}>
        <div className="flex items-center gap-3">
          <span className="font-bold">Pipe<span style={{ color: '#00d4aa' }}>loop.ai</span></span>
          <span className="hidden sm:inline text-xs px-2.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(0,212,170,0.1)', color: '#00d4aa', border: '1px solid rgba(0,212,170,0.2)' }}>
            Sales strategy for {company}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { setPhase('wizard'); setResearched(false) }} className="text-xs" style={{ color: '#6b6b80' }}>← Redo</button>
          <Link href="/login" className="text-xs font-semibold px-4 py-1.5 rounded-full" style={{ backgroundColor: '#00d4aa', color: '#0a0a0f' }}>
            Start free trial →
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">

        {/* SUMMARY */}
        <section className="rounded-2xl border p-6" style={{ backgroundColor: '#111118', borderColor: '#1e1e2e', background: 'linear-gradient(135deg, #111118 0%, rgba(0,212,170,0.03) 100%)' }}>
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-lg" style={{ backgroundColor: 'rgba(0,212,170,0.1)' }}>✦</div>
            <div>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h2 className="font-bold">Your sales opportunity</h2>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#1a1a24', color: '#6b6b80' }}>
                  {SIZE_STEPS[sizeIdx]} employees · {regionLabel}
                </span>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: '#a0a0b0' }}>{s.summary}</p>
            </div>
          </div>
        </section>

        {/* SALES PROCESS */}
        <section>
          <SH icon="🎯" label="Your automated sales process" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {s.sales_process.map(st => (
              <div key={st.step} className="rounded-xl border p-4" style={{ backgroundColor: '#111118', borderColor: '#1e1e2e' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: (CH[st.channel] || '#6b6b80') + '20', color: CH[st.channel] || '#6b6b80' }}>
                    {st.channel}
                  </span>
                  <span className="text-xs" style={{ color: '#44445a' }}>{st.step}</span>
                </div>
                <p className="text-sm font-semibold mb-1">{st.label}</p>
                <p className="text-xs leading-relaxed mb-2" style={{ color: '#6b6b80' }}>{st.description}</p>
                <p className="text-xs" style={{ color: '#44445a' }}>{st.timeline}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="grid lg:grid-cols-2 gap-8">

          {/* LINKEDIN */}
          <section>
            <SH icon="💼" label="LinkedIn connections to target" sub={`Based on your ICP in ${regionLabel}`} />
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
                  <p className="text-xs mt-2 leading-relaxed" style={{ color: '#a0a0b0' }}>{p.why}</p>
                  <div className="mt-2 text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: 'rgba(14,165,233,0.06)', color: '#0ea5e9', border: '1px solid rgba(14,165,233,0.15)' }}>
                    🔥 {p.signal}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="space-y-6">

            {/* LANDING PAGE */}
            <section>
              <SH icon="🌐" label="Personalized landing page" />
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
                  client.pipeloop.ai/{company.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}/[prospect]
                </div>
              </div>
            </section>

            {/* WHITEPAPERS */}
            <section>
              <SH icon="📄" label="Whitepaper concepts" sub="Full document generated per prospect by AI" />
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

            {/* NEWSLETTER */}
            <section>
              <SH icon="✉️" label="Welcome email — sent on day 1" />
              <div className="rounded-xl border p-5" style={{ backgroundColor: '#111118', borderColor: '#1e1e2e' }}>
                <div className="text-xs px-3 py-1.5 rounded mb-3 font-mono" style={{ backgroundColor: '#1a1a24', color: '#f59e0b' }}>
                  Subject: {s.newsletter.subject}
                </div>
                <p className="text-sm leading-relaxed" style={{ color: '#a0a0b0' }}>{s.newsletter.preview}</p>
              </div>
            </section>

            {/* REDDIT */}
            <section>
              <SH icon="🔴" label="Reddit communities" sub="Where your ICP hangs out" />
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

        {/* FINAL CTA */}
        <section className="rounded-2xl p-8 text-center" style={{ background: 'linear-gradient(135deg, #111118 0%, rgba(0,212,170,0.06) 100%)', border: '1px solid rgba(0,212,170,0.2)' }}>
          <div className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full mb-5" style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>
            ● 847 companies generated their strategy this week
          </div>
          <h2 className="text-2xl font-bold mb-2">Run this on autopilot.</h2>
          <p className="text-sm mb-8 max-w-md mx-auto" style={{ color: '#6b6b80' }}>
            Pipeloop executes this entire strategy automatically — finding leads, sending LinkedIn messages, generating whitepapers, and booking meetings while you sleep. Sam spends 15 minutes a day.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="https://calendly.com/sam-balkenende/30min"
              target="_blank"
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all w-full sm:w-auto justify-center"
              style={{ backgroundColor: '#1a1a24', color: '#e2e2ef', border: '1px solid #2a2a3a' }}
            >
              📅 Book a 30-min demo call
            </Link>
            <Link
              href="/login"
              className="flex items-center gap-2 px-8 py-3 rounded-xl font-bold text-sm transition-all w-full sm:w-auto justify-center"
              style={{ backgroundColor: '#00d4aa', color: '#0a0a0f' }}
            >
              🚀 Start my 14-day free trial →
            </Link>
          </div>
          <p className="text-xs mt-4" style={{ color: '#44445a' }}>No credit card · Cancel anytime · Live in 30 minutes</p>
        </section>

        <div className="pb-8" />
      </div>
    </div>
  )
}

/* ── REGION BUTTON ── */
function RegionBtn({ label, emoji, active, onClick }: { id?: string; label: string; emoji: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full p-2 rounded-xl text-center transition-all text-xs"
      style={{
        backgroundColor: active ? 'rgba(0,212,170,0.12)' : '#0d0d14',
        border: `1px solid ${active ? 'rgba(0,212,170,0.4)' : '#1e1e2e'}`,
        color: active ? '#00d4aa' : '#6b6b80',
        fontWeight: active ? 700 : 400,
      }}
    >
      <div className="text-base mb-0.5">{emoji}</div>
      <div className="leading-tight">{label}</div>
    </button>
  )
}

/* ── FIELD ── */
function Field({ label, value, onChange, placeholder, textarea }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string; textarea?: boolean
}) {
  const cls = "w-full text-sm px-3 py-2.5 rounded-xl outline-none resize-none"
  const style = { backgroundColor: '#0d0d14', border: '1px solid #1e1e2e', color: '#e2e2ef' }
  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-wide mb-1.5 block" style={{ color: '#44445a' }}>{label}</label>
      {textarea ? (
        <textarea className={cls} style={style} rows={2} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      ) : (
        <input className={cls} style={style} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </div>
  )
}

/* ── SECTION HEADER ── */
function SH({ icon, label, sub }: { icon: string; label: string; sub?: string }) {
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
