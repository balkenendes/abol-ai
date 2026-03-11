'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Users, TrendingUp, Flame, MessageSquare, ArrowRight, Clock, CheckCircle, XCircle, LayoutDashboard, UserSearch, Mail, Settings, LogIn, ChevronRight } from 'lucide-react'

const DEMO_LEADS = [
  { id: '1', first_name: 'Thomas', last_name: 'de Vries', company: 'Scale Ventures BV', title: 'CEO', engagement_score: 9, stage: 'warm', enrichment_status: 'completed', source: 'apollo', is_warm: true },
  { id: '2', first_name: 'Sarah', last_name: 'Müller', company: 'GrowthStack GmbH', title: 'Head of Sales', engagement_score: 8, stage: 'engaged', enrichment_status: 'completed', source: 'apollo', is_warm: true },
  { id: '3', first_name: 'Jan', last_name: 'Bakker', company: 'Bakker & Partners', title: 'Founder', engagement_score: 7, stage: 'enriched', enrichment_status: 'completed', source: 'csv', is_warm: true },
  { id: '4', first_name: 'Emma', last_name: 'Wilson', company: 'TechFlow Ltd', title: 'VP Sales', engagement_score: 6, stage: 'contacted', enrichment_status: 'completed', source: 'apollo', is_warm: false },
  { id: '5', first_name: 'Lars', last_name: 'Hansen', company: 'NordTech AS', title: 'CRO', engagement_score: 5, stage: 'new', enrichment_status: 'processing', source: 'linkedin_url', is_warm: false },
  { id: '6', first_name: 'Marie', last_name: 'Dubois', company: 'Croissance SaaS', title: 'Director', engagement_score: 8, stage: 'warm', enrichment_status: 'completed', source: 'apollo', is_warm: true },
]

const DEMO_MESSAGES = [
  {
    id: '1',
    lead: 'Thomas de Vries',
    company: 'Scale Ventures BV',
    channel: 'LinkedIn DM',
    content: 'Hi Thomas, I noticed Scale Ventures recently expanded into the DACH market — congrats! At Pipeloop we help B2B founders automate their outbound so they can focus on closing. Would a 15-min call make sense this week?',
    status: 'pending_review',
  },
  {
    id: '2',
    lead: 'Sarah Müller',
    company: 'GrowthStack GmbH',
    channel: 'Email',
    content: 'Subject: Outbound automation for GrowthStack\n\nHi Sarah, saw your post about scaling the SDR team at GrowthStack. We built Pipeloop to do exactly that — automated outbound that runs 15 min/day. Happy to show you how it works?',
    status: 'pending_review',
  },
  {
    id: '3',
    lead: 'Jan Bakker',
    company: 'Bakker & Partners',
    channel: 'LinkedIn Connect',
    content: 'Hi Jan, I help founders like you build automated sales pipelines. Would love to connect!',
    status: 'approved',
  },
]

const scoreColor = (score: number) => {
  if (score >= 8) return { bg: 'rgba(0,212,170,0.15)', color: '#00d4aa' }
  if (score >= 5) return { bg: 'rgba(249,115,22,0.15)', color: '#fb923c' }
  return { bg: '#1a1a24', color: '#a0a0b0' }
}

const stageLabel: Record<string, string> = {
  warm: 'Warm', engaged: 'Engaged', enriched: 'Enriched',
  contacted: 'Contacted', new: 'New', processing: 'Processing',
}

type Tab = 'dashboard' | 'leads' | 'review'

export default function DemoPage() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [messages, setMessages] = useState(DEMO_MESSAGES)
  const [approved, setApproved] = useState<string[]>([])
  const [rejected, setRejected] = useState<string[]>([])

  const warmLeads = DEMO_LEADS.filter(l => l.is_warm)
  const pending = messages.filter(m => m.status === 'pending_review')

  const approve = (id: string) => {
    setApproved(a => [...a, id])
    setMessages(ms => ms.map(m => m.id === id ? { ...m, status: 'approved' } : m))
  }
  const reject = (id: string) => {
    setRejected(r => [...r, id])
    setMessages(ms => ms.map(m => m.id === id ? { ...m, status: 'rejected' } : m))
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#0a0a0f', color: '#ffffff' }}>
      {/* Demo banner */}
      <div
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-2 text-xs"
        style={{ backgroundColor: 'rgba(0,212,170,0.1)', borderBottom: '1px solid rgba(0,212,170,0.2)', color: '#00d4aa' }}
      >
        <span>👁 Demo mode — dit is een preview van de echte app</span>
        <Link
          href="/login"
          className="flex items-center gap-1 font-semibold px-3 py-1 rounded-full transition-colors"
          style={{ backgroundColor: '#00d4aa', color: '#0a0a0f' }}
        >
          <LogIn className="w-3 h-3" /> Start gratis
        </Link>
      </div>

      {/* Sidebar */}
      <aside
        className="w-56 shrink-0 flex flex-col pt-10 border-r"
        style={{ backgroundColor: '#0d0d14', borderColor: '#222233' }}
      >
        <div className="px-4 py-4 border-b" style={{ borderColor: '#222233' }}>
          <span className="text-lg font-bold">Pipe<span style={{ color: '#00d4aa' }}>loop.ai</span></span>
          <p className="text-xs mt-0.5" style={{ color: '#555566' }}>Jouw BV — Demo</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'leads', label: 'Leads', icon: UserSearch },
            { id: 'review', label: 'Review queue', icon: Mail, badge: pending.length },
          ].map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              onClick={() => setTab(id as Tab)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left"
              style={{
                backgroundColor: tab === id ? 'rgba(0,212,170,0.1)' : 'transparent',
                color: tab === id ? '#00d4aa' : '#a0a0b0',
              }}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
              {badge ? (
                <span className="ml-auto text-xs px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: '#00d4aa', color: '#0a0a0f' }}>
                  {badge}
                </span>
              ) : null}
            </button>
          ))}

          <button
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left"
            style={{ color: '#555566' }}
          >
            <Settings className="w-4 h-4 shrink-0" /> Instellingen
          </button>
        </nav>

        <div className="px-3 py-4 border-t" style={{ borderColor: '#222233' }}>
          <Link
            href="/login"
            className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-sm font-semibold transition-colors"
            style={{ backgroundColor: '#00d4aa', color: '#0a0a0f' }}
          >
            <LogIn className="w-3.5 h-3.5" /> Start gratis
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pt-8">
        {tab === 'dashboard' && (
          <div className="p-6 max-w-5xl">
            <h1 className="text-2xl font-bold mb-1">Jouw Pipeline</h1>
            <p className="text-sm mb-8" style={{ color: '#a0a0b0' }}>Dit is wat er vandaag speelt.</p>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {[
                { label: 'Leads totaal', value: 24, icon: Users, color: '#a0a0b0' },
                { label: 'Verrijkt', value: 18, icon: TrendingUp, color: '#00d4aa' },
                { label: 'Warm leads', value: 4, icon: Flame, color: '#f97316' },
                { label: 'Berichten gegenereerd', value: 12, icon: MessageSquare, color: '#a78bfa' },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="rounded-xl p-5 border" style={{ backgroundColor: '#111118', borderColor: '#222233' }}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm" style={{ color: '#a0a0b0' }}>{label}</span>
                    <Icon className="w-4 h-4" style={{ color }} />
                  </div>
                  <div className="text-3xl font-bold">{value}</div>
                </div>
              ))}
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              {/* Warm leads */}
              <div className="rounded-xl border" style={{ backgroundColor: '#111118', borderColor: '#222233' }}>
                <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#222233' }}>
                  <span className="font-semibold flex items-center gap-2"><Flame className="w-4 h-4 text-orange-400" /> Warm Leads</span>
                  <button onClick={() => setTab('leads')} className="text-xs flex items-center gap-1" style={{ color: '#00d4aa' }}>
                    Alles zien <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="p-4 space-y-2">
                  {warmLeads.map(lead => (
                    <div key={lead.id} className="flex items-center justify-between p-3 rounded-lg" style={{ border: '1px solid #222233' }}>
                      <div>
                        <p className="text-sm font-medium">{lead.first_name} {lead.last_name}</p>
                        <p className="text-xs" style={{ color: '#a0a0b0' }}>{lead.title} · {lead.company}</p>
                      </div>
                      <span className="text-xs font-bold px-2 py-1 rounded-full" style={scoreColor(lead.engagement_score)}>
                        {lead.engagement_score}/10
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent activity */}
              <div className="rounded-xl border" style={{ backgroundColor: '#111118', borderColor: '#222233' }}>
                <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#222233' }}>
                  <span className="font-semibold flex items-center gap-2"><Clock className="w-4 h-4" style={{ color: '#a0a0b0' }} /> Recente activiteit</span>
                </div>
                <div className="p-4 space-y-2">
                  {DEMO_LEADS.slice(0, 5).map(lead => (
                    <div key={lead.id} className="flex items-center justify-between p-3 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ backgroundColor: '#1a1a24', color: '#00d4aa' }}>
                          {lead.first_name[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{lead.first_name} {lead.last_name}</p>
                          <p className="text-xs" style={{ color: '#555566' }}>{lead.company}</p>
                        </div>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{
                        backgroundColor: lead.enrichment_status === 'completed' ? 'rgba(0,212,170,0.1)' : '#1a1a24',
                        color: lead.enrichment_status === 'completed' ? '#00d4aa' : '#555566',
                      }}>{stageLabel[lead.stage]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'leads' && (
          <div className="p-6 max-w-5xl">
            <h1 className="text-2xl font-bold mb-1">Leads</h1>
            <p className="text-sm mb-8" style={{ color: '#a0a0b0' }}>Al je leads op één plek.</p>
            <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: '#111118', borderColor: '#222233' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid #222233' }}>
                    {['Naam', 'Bedrijf', 'Functie', 'Score', 'Status', 'Bron'].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-medium" style={{ color: '#a0a0b0' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DEMO_LEADS.map((lead, i) => (
                    <tr key={lead.id} style={{ borderBottom: i < DEMO_LEADS.length - 1 ? '1px solid #1a1a24' : 'none' }}>
                      <td className="px-4 py-3 font-medium">{lead.first_name} {lead.last_name}</td>
                      <td className="px-4 py-3" style={{ color: '#a0a0b0' }}>{lead.company}</td>
                      <td className="px-4 py-3" style={{ color: '#a0a0b0' }}>{lead.title}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-bold px-2 py-1 rounded-full" style={scoreColor(lead.engagement_score)}>
                          {lead.engagement_score}/10
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{
                          backgroundColor: lead.enrichment_status === 'completed' ? 'rgba(0,212,170,0.1)' : '#1a1a24',
                          color: lead.enrichment_status === 'completed' ? '#00d4aa' : '#555566',
                        }}>{stageLabel[lead.stage]}</span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: '#555566' }}>{lead.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'review' && (
          <div className="p-6 max-w-3xl">
            <h1 className="text-2xl font-bold mb-1">Review queue</h1>
            <p className="text-sm mb-8" style={{ color: '#a0a0b0' }}>Keur berichten goed of af. Goedgekeurde berichten worden automatisch verstuurd.</p>
            <div className="space-y-4">
              {messages.map(msg => (
                <div key={msg.id} className="rounded-xl border p-5" style={{ backgroundColor: '#111118', borderColor: msg.status === 'approved' ? 'rgba(0,212,170,0.3)' : msg.status === 'rejected' ? 'rgba(239,68,68,0.2)' : '#222233' }}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="font-semibold">{msg.lead}</span>
                      <span className="text-sm ml-2" style={{ color: '#a0a0b0' }}>· {msg.company}</span>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#1a1a24', color: '#a0a0b0' }}>{msg.channel}</span>
                  </div>
                  <p className="text-sm mb-4 whitespace-pre-line" style={{ color: '#d0d0e0' }}>{msg.content}</p>
                  {msg.status === 'pending_review' && (
                    <div className="flex gap-3">
                      <button
                        onClick={() => approve(msg.id)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                        style={{ backgroundColor: '#00d4aa', color: '#0a0a0f' }}
                      >
                        <CheckCircle className="w-4 h-4" /> Goedkeuren
                      </button>
                      <button
                        onClick={() => reject(msg.id)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                        style={{ backgroundColor: '#1a1a24', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
                      >
                        <XCircle className="w-4 h-4" /> Afwijzen
                      </button>
                    </div>
                  )}
                  {msg.status === 'approved' && (
                    <span className="flex items-center gap-1.5 text-sm" style={{ color: '#00d4aa' }}>
                      <CheckCircle className="w-4 h-4" /> Goedgekeurd — wordt verstuurd
                    </span>
                  )}
                  {msg.status === 'rejected' && (
                    <span className="flex items-center gap-1.5 text-sm" style={{ color: '#f87171' }}>
                      <XCircle className="w-4 h-4" /> Afgewezen
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
