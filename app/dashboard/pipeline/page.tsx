'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

/* ─────────────── TYPES ─────────────── */
interface Lead {
  id: string
  first_name: string | null
  last_name: string | null
  company: string | null
  title: string | null
  linkedin_url: string | null
  email: string | null
  stage: string
  enrichment_status: string | null
  engagement_score: number | null
  updated_at: string
}

interface StepMetrics {
  count: number
  liveItems: string[]
}

/* ─────────────── THEME ─────────────── */
const C = {
  bg: '#0a0a0f',
  bgCard: '#111118',
  bgHover: '#1a1a24',
  border: '#1e1e2e',
  borderActive: '#3b82f6',
  text: '#e2e2ef',
  textMuted: '#6b6b80',
  textDim: '#44445a',
  accent: '#3b82f6',
  accentGlow: 'rgba(59,130,246,0.12)',
  success: '#22c55e',
  warning: '#f59e0b',
  hot: '#ef4444',
  warm: '#f97316',
  cold: '#64748b',
  purple: '#a78bfa',
  cyan: '#22d3ee',
}

/* ─────────────── PIPELINE STEPS ─────────────── */
const PIPELINE_STEPS = [
  { id: 'icp',        label: 'ICP Targeting',      icon: '🎯', aiName: 'Scout AI',   desc: 'Ideal Customer Profile matching' },
  { id: 'research',   label: 'Lead Research',       icon: '🔍', aiName: 'Insight AI', desc: 'Pain point & context analysis' },
  { id: 'scrape',     label: 'Website Scan',        icon: '🌐', aiName: 'Crawler AI', desc: 'Website & tech stack detection' },
  { id: 'enrichment', label: 'Data Enrichment',     icon: '⚡', aiName: 'Enrich AI',  desc: 'Firmographic & contact data' },
  { id: 'linkedin',   label: 'LinkedIn Connect',    icon: '💼', aiName: 'Vincent',    desc: 'Connection request automation' },
  { id: 'outreach',   label: 'Follow-up Outreach',  icon: '📧', aiName: 'Outreach AI',desc: 'DM & email fallback delivery' },
  { id: 'warm',       label: 'Warm Lead',           icon: '🚀', aiName: 'Convert AI', desc: 'High-intent — ready to close' },
]

/* ─────────────── HELPERS ─────────────── */
function stageToStep(stage: string, enrichmentStatus: string | null): number {
  if (stage === 'warm' || stage === 'meeting_booked' || stage === 'closed_won') return 7
  if (stage === 'engaged' || stage === 'connected') return 6
  if (stage === 'contacted') return 5
  if (stage === 'enriched') return 4
  if (enrichmentStatus === 'processing') return 3
  if (enrichmentStatus === 'completed') return 4
  return 1
}

function heatScore(score: number | null): number {
  if (!score) return 20
  return Math.min(100, Math.round(score * 10))
}

function successChance(score: number | null, stage: string): number {
  const base = score ? score * 8 : 15
  const bonus: Record<string, number> = { warm: 20, meeting_booked: 35, engaged: 12, connected: 6, contacted: 3 }
  return Math.min(97, Math.round(base + (bonus[stage] ?? 0)))
}

function statusLabel(stage: string, enrichmentStatus: string | null): string {
  const labels: Record<string, string> = {
    new: enrichmentStatus === 'processing' ? 'Enrichment in progress' : 'ICP matched',
    enriched: 'Enrichment complete',
    contacted: 'LinkedIn request sent',
    connected: 'Connection accepted',
    engaged: 'Replied',
    warm: 'Warm — ready to close',
    meeting_booked: 'Meeting booked!',
    closed_won: 'Won ✓',
    closed_lost: 'Lost',
  }
  return labels[stage] ?? stage
}

function initials(first: string | null, last: string | null): string {
  return `${(first ?? '?')[0]}${(last ?? '?')[0]}`.toUpperCase()
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function computeStepMetrics(leads: Lead[]): Record<number, StepMetrics> {
  const metrics: Record<number, StepMetrics> = {}
  for (let i = 1; i <= 7; i++) metrics[i] = { count: 0, liveItems: [] }

  for (const lead of leads) {
    const step = stageToStep(lead.stage, lead.enrichment_status)
    metrics[step].count++
    if (metrics[step].liveItems.length < 4) {
      const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown'
      const company = lead.company ?? ''
      metrics[step].liveItems.push(company ? `${name} @ ${company}` : name)
    }
  }
  return metrics
}

/* ─────────────── SUB-COMPONENTS ─────────────── */

function PulsingDot({ color = C.success, size = 6 }: { color?: string; size?: number }) {
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: size, height: size, flexShrink: 0 }}>
      <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: color, animation: 'pulse 2s ease-in-out infinite' }} />
      <span style={{ position: 'absolute', inset: -2, borderRadius: '50%', background: `${color}40`, animation: 'pulse 2s ease-in-out infinite 0.5s' }} />
    </span>
  )
}

function HeatBar({ value, width = 60, height = 4 }: { value: number; width?: number; height?: number }) {
  const color = value > 80 ? C.hot : value > 60 ? C.warm : value > 40 ? C.warning : C.cold
  return (
    <div style={{ width, height, background: `${color}20`, borderRadius: 1, overflow: 'hidden' }}>
      <div style={{ width: `${value}%`, height: '100%', background: color, transition: 'width 1s ease' }} />
    </div>
  )
}

function ArrowConnector() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', alignSelf: 'center', margin: '0 -1px', flexShrink: 0, zIndex: 1 }}>
      <div style={{ width: 18, height: 1, background: C.border }} />
      <div style={{ width: 0, height: 0, borderTop: '4px solid transparent', borderBottom: '4px solid transparent', borderLeft: `6px solid ${C.textDim}` }} />
    </div>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 6px', background: `${C.accent}15`, color: C.accent, fontSize: 9, borderRadius: 1, marginRight: 4, marginBottom: 2 }}>
      {children}
    </span>
  )
}

function HeatBadge({ heat }: { heat: number }) {
  const color = heat > 80 ? C.hot : heat > 60 ? C.warm : heat > 40 ? C.warning : C.cold
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: `${color}18`, color, fontSize: 11, fontWeight: 600, borderRadius: 1 }}>
      🔥 {heat}
    </span>
  )
}

function StepCard({
  step,
  index,
  active,
  metrics,
  onClick,
}: {
  step: typeof PIPELINE_STEPS[0]
  index: number
  active: boolean
  metrics: StepMetrics
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLDivElement).style.borderColor = C.textDim }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLDivElement).style.borderColor = C.border }}
      style={{
        flex: '1 0 180px', minWidth: 180, maxWidth: 220,
        background: active ? C.bgHover : C.bgCard,
        border: `1px solid ${active ? C.borderActive : C.border}`,
        borderRadius: 2, display: 'flex', flexDirection: 'column',
        cursor: 'pointer', transition: 'all 0.3s', position: 'relative', overflow: 'hidden',
      }}
    >
      {active && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: C.accent }} />}

      {/* AI LAYER */}
      <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.border}`, background: 'rgba(59,130,246,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <PulsingDot color={C.accent} size={5} />
          <span style={{ fontSize: 10, color: C.accent, fontWeight: 600, letterSpacing: '0.05em' }}>{step.aiName}</span>
        </div>
        <div style={{ fontSize: 9, color: C.textDim, lineHeight: 1.4 }}>{step.desc}</div>
      </div>

      {/* PROCESS LAYER */}
      <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.border}`, flex: 1 }}>
        <div style={{ fontSize: 18, marginBottom: 6 }}>{step.icon}</div>
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2, color: active ? C.text : C.textMuted }}>{step.label}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
          <Tag>{metrics.count} lead{metrics.count !== 1 ? 's' : ''}</Tag>
        </div>
        {metrics.count > 0 && (
          <div style={{ marginTop: 6, fontSize: 10, color: C.warning }}>
            {metrics.count} active here
          </div>
        )}
      </div>

      {/* DATA LAYER */}
      <div style={{ padding: '8px 12px', fontSize: 10, color: C.textMuted, maxHeight: 90, overflow: 'hidden' }}>
        <div style={{ fontSize: 9, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Live</div>
        {metrics.liveItems.length === 0 ? (
          <div style={{ color: C.textDim, fontSize: 10 }}>No leads here yet</div>
        ) : (
          metrics.liveItems.map((item, i) => (
            <div key={i} style={{ padding: '2px 0', fontSize: 10, color: C.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <span style={{ color: C.textDim, marginRight: 4 }}>›</span>{item}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function ProspectRow({
  lead,
  index,
  selected,
  onSelect,
}: {
  lead: Lead
  index: number
  selected: boolean
  onSelect: () => void
}) {
  const heat = heatScore(lead.engagement_score)
  const chance = successChance(lead.engagement_score, lead.stage)
  const step = stageToStep(lead.stage, lead.enrichment_status)
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown'

  return (
    <div
      onClick={onSelect}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLDivElement).style.background = C.bgHover }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLDivElement).style.background = index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
        borderBottom: `1px solid ${C.border}`,
        background: selected ? C.accentGlow : index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
        cursor: 'pointer', transition: 'background 0.15s',
      }}
    >
      {/* Avatar */}
      <div style={{
        flex: '0 0 32px', width: 32, height: 32, borderRadius: 1,
        background: `linear-gradient(135deg, ${C.accent}30, ${C.purple}30)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, color: C.accent,
      }}>
        {initials(lead.first_name, lead.last_name)}
      </div>

      {/* Name + company */}
      <div style={{ flex: 2, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 1 }}>{lead.company ?? 'Unknown company'}</div>
        <div style={{ fontSize: 10, color: C.textMuted }}>{name}{lead.title ? ` · ${lead.title}` : ''}</div>
        <div style={{ fontSize: 9, color: C.textDim, marginTop: 2 }}>{statusLabel(lead.stage, lead.enrichment_status)} · {timeAgo(lead.updated_at)}</div>
      </div>

      {/* Stage progress */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 2 }}>{PIPELINE_STEPS[step - 1]?.label}</div>
        <div style={{ display: 'flex', gap: 2 }}>
          {PIPELINE_STEPS.map((_, si) => (
            <div key={si} style={{ width: 12, height: 3, borderRadius: 1, background: si < step ? C.accent : `${C.accent}20` }} />
          ))}
        </div>
      </div>

      {/* Heat */}
      <div style={{ flex: '0 0 80px' }}>
        <HeatBadge heat={heat} />
        <div style={{ marginTop: 4 }}>
          <HeatBar value={heat} width={60} height={3} />
        </div>
      </div>

      {/* Success % */}
      <div style={{ flex: '0 0 60px', textAlign: 'right' }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: chance > 75 ? C.success : chance > 50 ? C.warning : C.textMuted }}>
          {chance}%
        </span>
      </div>
    </div>
  )
}

function ProspectDetail({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const heat = heatScore(lead.engagement_score)
  const chance = successChance(lead.engagement_score, lead.stage)
  const step = stageToStep(lead.stage, lead.enrichment_status)
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown'

  return (
    <div style={{ padding: 16, borderBottom: `1px solid ${C.border}`, background: C.accentGlow, flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{lead.company ?? 'Unknown'}</div>
          <div style={{ fontSize: 11, color: C.textMuted }}>{name}{lead.title ? ` · ${lead.title}` : ''}</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.textMuted, cursor: 'pointer', padding: '2px 6px', fontSize: 10, fontFamily: 'inherit', borderRadius: 1 }}>✕</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
        {[
          { label: 'Stage', value: PIPELINE_STEPS[step - 1]?.label ?? lead.stage },
          { label: 'Status', value: statusLabel(lead.stage, lead.enrichment_status) },
          { label: 'Email', value: lead.email ?? '—' },
          { label: 'Updated', value: timeAgo(lead.updated_at) },
        ].map((item, i) => (
          <div key={i}>
            <div style={{ fontSize: 9, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{item.label}</div>
            <div style={{ fontSize: 11, fontWeight: 500 }}>{item.value}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: C.textDim }}>Heat</span>
          <HeatBadge heat={heat} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: C.textDim }}>Success</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: chance > 75 ? C.success : C.warning }}>{chance}%</span>
        </div>
        {lead.linkedin_url && (
          <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: C.accent, textDecoration: 'none' }}>
            View LinkedIn →
          </a>
        )}
      </div>
    </div>
  )
}

function ChatPanel({
  step,
  metrics,
  totalLeads,
  onClose,
}: {
  step: typeof PIPELINE_STEPS[0]
  metrics: StepMetrics
  totalLeads: number
  onClose: () => void
}) {
  const [messages, setMessages] = useState<{ role: 'ai' | 'user'; text: string }[]>([])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMessages([
      {
        role: 'ai',
        text: `I'm **${step.aiName}**, running the **${step.label}** step.\n\nCurrently tracking ${metrics.count} lead${metrics.count !== 1 ? 's' : ''} at this stage (${totalLeads} total in pipeline).\n\nAsk me anything about this step or what to do next.`,
      },
    ])
  }, [step, metrics, totalLeads])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const sendMessage = useCallback(async () => {
    if (!input.trim()) return
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: userMsg }])
    setTyping(true)

    try {
      const res = await fetch('/api/ai/pipeline-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stepId: step.id,
          stepLabel: step.label,
          agentName: step.aiName,
          leadsAtStep: metrics.count,
          totalLeads,
          userMessage: userMsg,
        }),
      })
      const data = await res.json() as { reply?: string; error?: string }
      setMessages(prev => [...prev, { role: 'ai', text: data.reply ?? 'Something went wrong. Try again.' }])
    } catch {
      setMessages(prev => [...prev, { role: 'ai', text: 'Network error — try again.' }])
    } finally {
      setTyping(false)
    }
  }, [input, step, metrics, totalLeads])

  return (
    <div style={{ width: 380, flexShrink: 0, borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', background: C.bgCard }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <PulsingDot color={C.accent} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>{step.aiName}</span>
          </div>
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{step.label} · {metrics.count} leads</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.textMuted, cursor: 'pointer', padding: '4px 8px', fontSize: 11, fontFamily: 'inherit', borderRadius: 1 }}>✕</button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
            <div style={{
              padding: '8px 12px', borderRadius: 2,
              background: msg.role === 'user' ? C.accent : 'rgba(255,255,255,0.04)',
              color: msg.role === 'user' ? '#fff' : C.text,
              fontSize: 11, lineHeight: 1.6,
              border: msg.role === 'ai' ? `1px solid ${C.border}` : 'none',
              whiteSpace: 'pre-wrap',
            }}>
              {msg.text}
            </div>
          </div>
        ))}
        {typing && (
          <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 2, fontSize: 11, color: C.textDim, alignSelf: 'flex-start' }}>
            {step.aiName} is thinking...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: 12, borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8 }}>
        <input
          style={{ flex: 1, padding: '8px 12px', background: C.bg, border: `1px solid ${C.border}`, color: C.text, fontSize: 11, fontFamily: 'inherit', outline: 'none', borderRadius: 1 }}
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={`Ask ${step.aiName}...`}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          onFocus={e => (e.target.style.borderColor = C.borderActive)}
          onBlur={e => (e.target.style.borderColor = C.border)}
        />
        <button
          onClick={sendMessage}
          style={{ padding: '8px 16px', background: C.accent, color: '#fff', border: 'none', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, borderRadius: 1 }}
        >
          Send
        </button>
      </div>
    </div>
  )
}

/* ─────────────── MAIN PAGE ─────────────── */
export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [activeStep, setActiveStep] = useState<number | null>(null)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [now, setNow] = useState(new Date())

  // Clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Fetch leads
  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('leads')
        .select('id, first_name, last_name, company, title, linkedin_url, email, stage, enrichment_status, engagement_score, updated_at')
        .order('engagement_score', { ascending: false, nullsFirst: false })
        .limit(100)
      setLeads((data ?? []) as Lead[])
      setLoading(false)
    }
    load()
  }, [])

  const stepMetrics = computeStepMetrics(leads)
  const hotCount = leads.filter(l => heatScore(l.engagement_score) > 80).length
  const warmCount = leads.filter(l => { const h = heatScore(l.engagement_score); return h > 50 && h <= 80 }).length
  const coldCount = leads.filter(l => heatScore(l.engagement_score) <= 50).length

  const sortedLeads = [...leads].sort((a, b) => heatScore(b.engagement_score) - heatScore(a.engagement_score))

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace", overflow: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap');
        @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.5); } }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>

        {/* HEADER */}
        <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', borderBottom: `1px solid ${C.border}`, background: C.bgCard, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em' }}>
              <span style={{ color: C.accent }}>pipe</span><span>loop</span><span style={{ color: C.textDim }}>.ai</span>
            </div>
            <div style={{ width: 1, height: 20, background: C.border }} />
            <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Autonomous Pipeline</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <PulsingDot color={C.success} />
              <span style={{ fontSize: 10, color: C.success }}>7 AI agents active</span>
            </div>
            <div style={{ fontSize: 10, color: C.textDim }}>{now.toLocaleTimeString('nl-NL')} CET</div>
            <div style={{ width: 28, height: 28, borderRadius: 1, background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>SZ</div>
          </div>
        </div>

        {/* PIPELINE LABEL */}
        <div style={{ padding: '12px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.textMuted }}>Pipeline Process</span>
            <span style={{ fontSize: 9, padding: '2px 6px', background: `${C.success}15`, color: C.success, borderRadius: 1 }}>
              {loading ? 'LOADING' : 'LIVE'}
            </span>
          </div>
          <div style={{ fontSize: 10, color: C.textDim }}>Click any step to talk to its AI agent →</div>
        </div>

        {/* PIPELINE STEPS */}
        <div style={{ display: 'flex', gap: 2, padding: '20px 16px', overflowX: 'auto', flexShrink: 0, minHeight: 300 }}>
          {PIPELINE_STEPS.map((step, i) => (
            <div key={step.id} style={{ display: 'flex', alignItems: 'stretch' }}>
              <StepCard
                step={step}
                index={i}
                active={activeStep === i}
                metrics={stepMetrics[i + 1] ?? { count: 0, liveItems: [] }}
                onClick={() => setActiveStep(activeStep === i ? null : i)}
              />
              {i < PIPELINE_STEPS.length - 1 && <ArrowConnector />}
            </div>
          ))}
        </div>

        {/* LOWER SECTION: LEADS + CHAT */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', borderTop: `1px solid ${C.border}` }}>

          {/* LEADS LIST */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Leads header */}
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.textMuted }}>Prospects</span>
                <span style={{ fontSize: 10, color: C.textDim }}>{leads.length} tracked</span>
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 10 }}>
                <span style={{ color: C.hot }}>● Hot ({hotCount})</span>
                <span style={{ color: C.warm }}>● Warm ({warmCount})</span>
                <span style={{ color: C.cold }}>● Cold ({coldCount})</span>
              </div>
            </div>

            {/* Selected lead detail */}
            {selectedLead && (
              <ProspectDetail lead={selectedLead} onClose={() => setSelectedLead(null)} />
            )}

            {/* Column headers */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', borderBottom: `1px solid ${C.border}`, background: C.bgCard, flexShrink: 0 }}>
              <span style={{ flex: '0 0 32px' }} />
              <span style={{ flex: 2, fontSize: 9, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Company</span>
              <span style={{ flex: 1, fontSize: 9, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Stage</span>
              <span style={{ flex: '0 0 80px', fontSize: 9, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Heat</span>
              <span style={{ flex: '0 0 60px', fontSize: 9, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'right' }}>Success</span>
            </div>

            {/* Rows */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              {loading ? (
                <div style={{ padding: 32, textAlign: 'center', color: C.textDim, fontSize: 12 }}>Loading pipeline data...</div>
              ) : leads.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: C.textDim, fontSize: 12 }}>
                  No leads yet. Nova will find them automatically each morning.
                </div>
              ) : (
                sortedLeads.map((lead, i) => (
                  <ProspectRow
                    key={lead.id}
                    lead={lead}
                    index={i}
                    selected={selectedLead?.id === lead.id}
                    onSelect={() => setSelectedLead(selectedLead?.id === lead.id ? null : lead)}
                  />
                ))
              )}
            </div>
          </div>

          {/* CHAT PANEL */}
          {activeStep !== null && (
            <ChatPanel
              step={PIPELINE_STEPS[activeStep]}
              metrics={stepMetrics[activeStep + 1] ?? { count: 0, liveItems: [] }}
              totalLeads={leads.length}
              onClose={() => setActiveStep(null)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
