'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'

/* ── DEMO COMPANY ── */
const DEMO_COMPANY = {
  name: 'Momentum Software',
  website: 'momentumsoftware.nl',
  sell: 'Project management platform for mid-market operations teams',
  icp: 'Operations Directors & COOs at B2B companies with 50–500 employees in DACH + Benelux',
}

/* ── PIPELINE STAGES ── */
const STAGES = [
  { id: 'icp',       label: 'ICP Targeting',     icon: '🎯', agent: 'Scout AI',    color: '#6366f1' },
  { id: 'research',  label: 'Lead Research',      icon: '🔍', agent: 'Insight AI',  color: '#8b5cf6' },
  { id: 'crawl',     label: 'Website Crawl',      icon: '🌐', agent: 'Crawler AI',  color: '#a78bfa' },
  { id: 'enrich',    label: 'Enrichment',         icon: '⚡', agent: 'Enrich AI',   color: '#00d4aa' },
  { id: 'linkedin',  label: 'LinkedIn Outreach',  icon: '💼', agent: 'Vincent',     color: '#0ea5e9' },
  { id: 'email',     label: 'Email Sequence',     icon: '✉️', agent: 'Outreach AI', color: '#f59e0b' },
  { id: 'close',     label: 'Close & Convert',    icon: '🔥', agent: 'Convert AI',  color: '#ef4444' },
]

/* ── DEMO LEADS ── */
const LEADS = [
  {
    id: '1', stage: 'icp', first_name: 'Lukas', last_name: 'Bauer', title: 'Chief Operating Officer', company: 'EuroScale GmbH', location: 'Munich, Germany', employees: 180, website: 'euroscale.de', score: 2, linkedin_url: 'linkedin.com/in/lukasbauer',
    icp_match: 92, icp_reason: 'COO at 180-person B2B SaaS company in DACH region. Active on LinkedIn, recently posted about scaling operations.',
    enrichment: null, linkedin_msg: null, email: null, landing_url: null,
  },
  {
    id: '2', stage: 'icp', first_name: 'Anke', last_name: 'Vermeer', title: 'VP Operations', company: 'FlowBridge BV', location: 'Amsterdam, NL', employees: 95, website: 'flowbridge.io', score: 2, linkedin_url: 'linkedin.com/in/ankevermeer',
    icp_match: 88, icp_reason: 'VP Ops at Dutch SaaS scale-up, 95 employees, raised Series A in 2024. Perfect fit for product.',
    enrichment: null, linkedin_msg: null, email: null, landing_url: null,
  },
  {
    id: '3', stage: 'research', first_name: 'Thomas', last_name: 'de Vries', title: 'Director of Operations', company: 'Scale Ventures BV', location: 'Rotterdam, NL', employees: 140, website: 'scaleventures.nl', score: 4, linkedin_url: 'linkedin.com/in/thomasdevries',
    icp_match: 96, icp_reason: 'Director of Ops at 140-person company, manages 3 ops coordinators. Mentioned "manual tracking chaos" in a podcast interview.',
    enrichment: {
      company_summary: 'Scale Ventures is a Dutch B2B scale-up providing financial services automation to mid-market companies. Growing at ~40% YoY.',
      key_challenges: ['Manual reporting across 6 disconnected tools', 'Onboarding new hires takes 3+ weeks', 'No single source of truth for project status'],
      persuasion_profile: 'analytical',
      conversation_hooks: ['Mentioned on podcast: "we are drowning in Excel sheets"', 'Hired 3 new ops staff in Q1 2025', 'Using Monday.com + Notion + Airtable = chaos'],
    },
    linkedin_msg: null, email: null, landing_url: null,
  },
  {
    id: '4', stage: 'crawl', first_name: 'Sara', last_name: 'Müller', title: 'Head of Operations', company: 'GrowthStack GmbH', location: 'Berlin, Germany', employees: 220, website: 'growthstack.io', score: 5, linkedin_url: 'linkedin.com/in/saramuller',
    icp_match: 91,
    icp_reason: 'Head of Ops at 220-person SaaS company. Company recently acquired a competitor — integration challenges expected.',
    enrichment: {
      company_summary: 'GrowthStack is a Berlin-based B2B SaaS company offering revenue intelligence tools. Just completed acquisition of DataPulse in Feb 2025.',
      key_challenges: ['Post-acquisition integration chaos', 'Two separate ops teams with different workflows', 'Board pressure to reduce headcount while maintaining output'],
      persuasion_profile: 'driver',
      conversation_hooks: ['DataPulse acquisition Feb 2025 — integration live', 'LinkedIn post: "unifying two companies is harder than it looks"', 'Hiring freeze announced Q1 2025'],
    },
    website_intel: {
      tech_stack: ['Salesforce', 'Jira', 'Slack', 'HubSpot'],
      recent_news: 'Acquired DataPulse for €12M in February 2025',
      traffic_estimate: '45K monthly visitors',
      company_maturity: 'Series B',
    },
    linkedin_msg: null, email: null, landing_url: null,
  },
  {
    id: '5', stage: 'enrich', first_name: 'Jan', last_name: 'Bakker', title: 'COO', company: 'Bakker & Partners', location: 'Utrecht, NL', employees: 65, website: 'bakkerpartners.nl', score: 6, linkedin_url: 'linkedin.com/in/janbakker',
    icp_match: 85,
    icp_reason: 'COO at 65-person consultancy. Personal decision-maker. Uses WhatsApp for team coordination — inefficient.',
    enrichment: {
      company_summary: 'Bakker & Partners is a boutique operations consultancy serving mid-market clients in Benelux. 65 employees, profitable, founder-led.',
      key_challenges: ['Project delivery tracked in WhatsApp and email', 'Client reporting done manually every Friday', 'No visibility into team capacity or blockers'],
      persuasion_profile: 'relational',
      conversation_hooks: ['Jan is a speaker at OpsWorld NL 2025', 'Recent LinkedIn post about "operational clarity"', 'Just onboarded 3 new clients simultaneously'],
    },
    website_intel: {
      tech_stack: ['Microsoft 365', 'WhatsApp Business', 'Excel'],
      recent_news: 'Opened Utrecht office Q4 2024',
      traffic_estimate: '8K monthly visitors',
      company_maturity: 'Bootstrapped / Profitable',
    },
    whitepaper: {
      title: 'How Operations Leaders at 50–200 Person Companies Reclaim 8 Hours Per Week',
      url: 'pipeloop.ai/whitepaper/ops-leaders-2025',
      summary: 'A 12-page research report covering the top 5 operational bottlenecks in scaling companies, with ROI benchmarks from 47 ops leaders. Personalized for Jan Bakker at Bakker & Partners.',
    },
    linkedin_msg: null, email: null, landing_url: null,
  },
  {
    id: '6', stage: 'linkedin', first_name: 'Emma', last_name: 'Wilson', title: 'VP Sales Operations', company: 'TechFlow Ltd', location: 'London, UK', employees: 310, website: 'techflow.io', score: 7, linkedin_url: 'linkedin.com/in/emmawilson',
    icp_match: 89,
    icp_reason: 'VP Sales Ops at 310-person UK SaaS. Manages RevOps team of 6. Posted about "toolstack sprawl" last week.',
    enrichment: {
      company_summary: 'TechFlow is a London-based B2B SaaS providing workflow automation to enterprise clients. ARR ~£8M, Series B.',
      key_challenges: ['6 different tools for sales ops — no integration', 'Quarterly planning takes 4 weeks of manual effort', 'CRM data quality below 60%'],
      persuasion_profile: 'analytical',
      conversation_hooks: ['LinkedIn: "spent 3 days cleaning CRM data last quarter"', 'Speaking at SaaStock London 2025', 'Techflow job post: Senior RevOps Analyst — signal of scaling pain'],
    },
    website_intel: {
      tech_stack: ['Salesforce', 'Outreach.io', 'Gong', 'Clari', 'Tableau'],
      recent_news: 'Series B of £15M closed in Nov 2024',
      traffic_estimate: '120K monthly visitors',
      company_maturity: 'Series B',
    },
    whitepaper: {
      title: 'The RevOps Consolidation Playbook: From 7 Tools to 1 Source of Truth',
      url: 'pipeloop.ai/whitepaper/revops-consolidation',
      summary: 'Tailored for Emma Wilson at TechFlow — covers tool consolidation ROI, CRM data quality frameworks, and a 90-day implementation roadmap.',
    },
    linkedin_msg: 'Hi Emma, your post about CRM data quality hit home — we see this exact problem at every Series B company. At Momentum, we brought TechFlow-style ops from 60% to 94% data accuracy in 11 weeks. Worth 20 minutes to show you how? Happy to share the full case study first.',
    email: null,
    landing_url: 'client.pipeloop.ai/techflow/emma-wilson',
  },
  {
    id: '7', stage: 'linkedin', first_name: 'Lars', last_name: 'Hansen', title: 'CRO', company: 'NordTech AS', location: 'Oslo, Norway', employees: 155, website: 'nordtech.no', score: 6, linkedin_url: 'linkedin.com/in/larshansen',
    icp_match: 83,
    icp_reason: 'CRO at Norwegian SaaS, cross-functional ops ownership. Company expanding to Benelux.',
    enrichment: {
      company_summary: 'NordTech is an Oslo-based B2B SaaS expanding into DACH and Benelux markets. Product: workforce planning software. 155 employees.',
      key_challenges: ['International expansion without dedicated ops infrastructure', 'Revenue forecasting inaccurate above 30% variance', 'No standardized onboarding for new markets'],
      persuasion_profile: 'visionary',
      conversation_hooks: ['Benelux expansion announced Q1 2025', 'Podcast: "we need to build the plane while flying it"', 'Hiring 12 new roles in Amsterdam in 2025'],
    },
    website_intel: {
      tech_stack: ['HubSpot', 'Pipedrive', 'Notion', 'Loom'],
      recent_news: 'Announced Benelux office in Amsterdam, Q1 2025',
      traffic_estimate: '28K monthly visitors',
      company_maturity: 'Series A',
    },
    whitepaper: {
      title: 'Scaling into New Markets Without Adding Headcount: An Ops Playbook',
      url: 'pipeloop.ai/whitepaper/market-expansion-ops',
      summary: 'Customized for Lars Hansen at NordTech — covers the operational infrastructure needed to expand internationally while maintaining velocity.',
    },
    linkedin_msg: 'Hi Lars, expanding into Benelux while building the internal ops to support it is one of the hardest phases for any SaaS — I\'ve seen it from both sides. We helped three Nordic scale-ups do exactly this in the last 18 months. Would a 15-min overview be useful as you plan Q2?',
    email: null,
    landing_url: 'client.pipeloop.ai/nordtech/lars-hansen',
  },
  {
    id: '8', stage: 'email', first_name: 'Marie', last_name: 'Dubois', title: 'Director of Ops', company: 'Croissance SaaS', location: 'Paris, France', employees: 88, website: 'croissance.io', score: 8, linkedin_url: 'linkedin.com/in/mariedubois',
    icp_match: 94,
    icp_reason: 'Director of Ops at 88-person French SaaS. Accepted LinkedIn connection. Opened email within 2h. Hot lead.',
    enrichment: {
      company_summary: 'Croissance SaaS provides growth analytics for e-commerce brands. 88 employees, Series A, revenue ~€3.2M. Hiring aggressively in 2025.',
      key_challenges: ['Team grew 60% in 12 months — ops hasn\'t kept up', 'Project visibility is zero after sprint planning', 'Leadership decisions delayed by lack of real-time data'],
      persuasion_profile: 'analytical',
      conversation_hooks: ['Accepted LinkedIn connection within 4 hours', 'Opened email — clicked "case study" link', '60% team growth in 12 months — ops breaking point'],
    },
    website_intel: {
      tech_stack: ['Notion', 'Linear', 'Figma', 'Slack', 'Stripe'],
      recent_news: 'Series A of €5M closed December 2024',
      traffic_estimate: '18K monthly visitors',
      company_maturity: 'Series A',
    },
    whitepaper: {
      title: 'Operational Maturity at Series A: The Framework 40 Fast-Growing SaaS Companies Use',
      url: 'pipeloop.ai/whitepaper/series-a-ops-maturity',
      summary: 'Built specifically for Marie at Croissance — benchmarks ops maturity at 60–120 person SaaS companies with growth above 40% YoY.',
    },
    linkedin_msg: 'Hi Marie, congrats on the Series A — impressive growth. I noticed Croissance has nearly doubled in 12 months, which is exactly when ops infrastructure becomes the bottleneck. We\'ve helped 6 similar-stage companies get ahead of this. Worth a quick call this week?',
    email: 'Subject: The ops problem that hits every €3M SaaS company\n\nHi Marie,\n\nYou opened our case study last Tuesday — thanks for the interest. I wanted to follow up with something more specific to Croissance.\n\nAt your growth rate (60% in 12 months), the #1 thing that breaks is operational visibility. Leaders make decisions with 2-week-old data. Projects fall through the cracks. Good people leave because nothing works.\n\nWe\'ve seen this pattern at 6 French and Belgian Series A companies in the last year. The fix is faster than most expect — typically 8–10 weeks to full visibility.\n\nI attached a 2-pager with numbers from a comparable company (French SaaS, 90 people, Series A). Happy to walk you through it in 20 minutes.\n\n— Sam\nMomentum Software | sam@momentumsoftware.nl',
    landing_url: 'client.pipeloop.ai/croissance/marie-dubois',
  },
  {
    id: '9', stage: 'close', first_name: 'Pieter', last_name: 'van den Berg', title: 'COO', company: 'Apex Operations BV', location: 'The Hague, NL', employees: 210, website: 'apexops.nl', score: 9, linkedin_url: 'linkedin.com/in/pietervanDenberg',
    icp_match: 98,
    icp_reason: 'WARM — replied to email, requested demo, mentioned budget approved. Meeting booked for next Tuesday.',
    enrichment: {
      company_summary: 'Apex Operations is a Dutch B2B SaaS scale-up providing operational analytics to logistics companies. €6.8M ARR, growing 55% YoY.',
      key_challenges: ['COO manually compiles board report every month (takes 3 days)', 'No cross-team project tracking — each department has own system', 'Integration with Salesforce broken for 4 months'],
      persuasion_profile: 'driver',
      conversation_hooks: ['Replied: "yes, we have this exact problem — let\'s talk"', 'Budget approved Q1 — timeline is now', 'Board presentation coming up in 3 weeks'],
    },
    website_intel: {
      tech_stack: ['Salesforce', 'SAP', 'Monday.com', 'Tableau'],
      recent_news: 'Announced €10M Series B in January 2025',
      traffic_estimate: '55K monthly visitors',
      company_maturity: 'Series B',
    },
    whitepaper: {
      title: 'How Apex Operations Can Save 3 Days Per Month on Board Reporting (and close the Salesforce gap)',
      url: 'pipeloop.ai/whitepaper/apex-ops-tailored',
      summary: 'Fully personalized for Pieter van den Berg — covers the exact integration architecture to connect Salesforce + SAP + Monday into a single ops view.',
    },
    linkedin_msg: 'Hi Pieter, thanks for connecting. Saw your recent post about scaling operational visibility — at Apex\'s growth rate, this becomes mission-critical. We built something specifically for ops leaders at Series B SaaS. Worth 15 minutes?',
    email: 'Subject: Re: Demo request — confirmed for Tuesday 14:00\n\nHi Pieter,\n\nLooking forward to Tuesday. I\'ll come prepared with a walkthrough tailored to Apex\'s setup (Salesforce + SAP + Monday).\n\nI\'ll also bring the ROI model we built for a comparable Dutch logistics SaaS — they cut board prep from 3 days to 4 hours in the first month.\n\nSee you Tuesday at 14:00. Calendar invite attached.\n\n— Sam',
    landing_url: 'client.pipeloop.ai/apex-operations/pieter-van-den-berg',
    meeting_booked: true,
    meeting_date: 'Tuesday, March 18 · 14:00 CET',
  },
]

/* ── STAGE STATS ── */
const stageCount = (stage: string) => LEADS.filter(l => l.stage === stage).length

/* ── TYPES ── */
type Lead = typeof LEADS[0]
type ChatMsg = { role: 'user' | 'assistant'; content: string }

/* ── HELPERS ── */
const heat = (score: number) => {
  if (score >= 8) return { label: 'HOT', bg: 'rgba(239,68,68,0.15)', color: '#ef4444' }
  if (score >= 6) return { label: 'WARM', bg: 'rgba(249,115,22,0.15)', color: '#f97316' }
  if (score >= 4) return { label: 'ENGAGED', bg: 'rgba(0,212,170,0.1)', color: '#00d4aa' }
  return { label: 'COLD', bg: '#1a1a24', color: '#6b6b80' }
}

const profileColor = (p: string) => ({
  analytical: '#6366f1', visionary: '#a78bfa', relational: '#00d4aa', driver: '#ef4444',
})[p] || '#6b6b80'

/* ═══════════════════════════════════════════════════════════ */
export default function DemoPage() {
  const [activeStage, setActiveStage] = useState('icp')
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [activeTab, setActiveTab] = useState<'profile' | 'linkedin' | 'email' | 'whitepaper' | 'landing' | 'chat'>('profile')
  const [chat, setChat] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatRef = useRef<HTMLDivElement>(null)

  const stageLeads = LEADS.filter(l => l.stage === activeStage)
  const currentStage = STAGES.find(s => s.id === activeStage)!

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [chat])

  useEffect(() => {
    setSelectedLead(null)
    setChat([])
    setActiveTab('profile')
  }, [activeStage])

  useEffect(() => {
    setChat([])
    setActiveTab('profile')
  }, [selectedLead?.id])

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return
    const msg = chatInput.trim()
    setChatInput('')
    const newChat: ChatMsg[] = [...chat, { role: 'user', content: msg }]
    setChat(newChat)
    setChatLoading(true)
    try {
      const res = await fetch('/api/ai/pipeline-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: activeStage,
          agentName: currentStage.agent,
          message: msg,
          leadContext: selectedLead ? {
            name: `${selectedLead.first_name} ${selectedLead.last_name}`,
            title: selectedLead.title,
            company: selectedLead.company,
            location: selectedLead.location,
            enrichment: selectedLead.enrichment,
          } : null,
          clientContext: DEMO_COMPANY,
          history: newChat.slice(-6),
        }),
      })
      const data = await res.json()
      setChat(c => [...c, { role: 'assistant', content: data.reply || 'No response.' }])
    } catch {
      setChat(c => [...c, { role: 'assistant', content: 'Connection error. Try again.' }])
    } finally {
      setChatLoading(false)
    }
  }

  const totalWarm = LEADS.filter(l => l.score >= 8).length
  const totalLeads = LEADS.length
  const meetingBooked = LEADS.filter(l => (l as typeof LEADS[0] & { meeting_booked?: boolean }).meeting_booked).length

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ backgroundColor: '#0a0a0f', color: '#e2e2ef', fontFamily: 'system-ui, sans-serif' }}>

      {/* ── TOP BAR ── */}
      <header className="shrink-0 flex items-center justify-between px-5 py-2.5 border-b z-20" style={{ backgroundColor: '#0d0d14', borderColor: '#1e1e2e' }}>
        <div className="flex items-center gap-4">
          <span className="text-base font-bold tracking-tight">Pipe<span style={{ color: '#00d4aa' }}>loop.ai</span></span>
          <span className="text-xs px-2.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'rgba(0,212,170,0.1)', color: '#00d4aa', border: '1px solid rgba(0,212,170,0.2)' }}>
            LIVE DEMO
          </span>
          <span className="text-xs hidden sm:block" style={{ color: '#6b6b80' }}>
            Autonomous AI sales team for <span style={{ color: '#e2e2ef' }}>{DEMO_COMPANY.name}</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-4 text-xs" style={{ color: '#6b6b80' }}>
            <span><span style={{ color: '#00d4aa', fontWeight: 600 }}>{totalLeads}</span> leads</span>
            <span><span style={{ color: '#f97316', fontWeight: 600 }}>{totalWarm}</span> hot</span>
            <span><span style={{ color: '#22c55e', fontWeight: 600 }}>{meetingBooked}</span> meeting booked</span>
          </div>
          <Link href="/login" className="text-xs font-semibold px-4 py-1.5 rounded-full transition-all" style={{ backgroundColor: '#00d4aa', color: '#0a0a0f' }}>
            Start free →
          </Link>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT SIDEBAR — PIPELINE ── */}
        <aside className="w-52 shrink-0 flex flex-col border-r overflow-y-auto" style={{ backgroundColor: '#0d0d14', borderColor: '#1e1e2e' }}>
          <div className="px-4 pt-4 pb-2">
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#44445a' }}>Pipeline Stages</p>
          </div>
          <nav className="px-2 space-y-0.5 flex-1">
            {STAGES.map((stage) => {
              const count = stageCount(stage.id)
              const active = activeStage === stage.id
              return (
                <button
                  key={stage.id}
                  onClick={() => setActiveStage(stage.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all group"
                  style={{
                    backgroundColor: active ? 'rgba(255,255,255,0.05)' : 'transparent',
                    border: active ? `1px solid ${stage.color}30` : '1px solid transparent',
                  }}
                >
                  <span className="text-sm shrink-0">{stage.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate" style={{ color: active ? '#e2e2ef' : '#6b6b80' }}>{stage.label}</div>
                    <div className="text-xs mt-0.5" style={{ color: active ? stage.color : '#44445a' }}>{stage.agent}</div>
                  </div>
                  {count > 0 && (
                    <span className="text-xs font-bold shrink-0 w-5 h-5 flex items-center justify-center rounded-full" style={{ backgroundColor: active ? stage.color : '#1a1a24', color: active ? '#0a0a0f' : '#6b6b80' }}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>

          {/* Funnel visualization */}
          <div className="px-4 py-4 border-t" style={{ borderColor: '#1e1e2e' }}>
            <p className="text-xs mb-3" style={{ color: '#44445a' }}>Conversion funnel</p>
            {STAGES.map(stage => {
              const count = stageCount(stage.id)
              const pct = Math.round((count / totalLeads) * 100)
              return (
                <div key={stage.id} className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs w-3 shrink-0" style={{ color: '#44445a' }}>{stage.icon}</span>
                  <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: '#1a1a24' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(pct, 5)}%`, backgroundColor: stage.color, opacity: 0.7 }} />
                  </div>
                  <span className="text-xs w-4 text-right" style={{ color: '#44445a' }}>{count}</span>
                </div>
              )
            })}
          </div>
        </aside>

        {/* ── CENTER — LEAD LIST ── */}
        <section className="w-72 shrink-0 flex flex-col border-r overflow-y-auto" style={{ borderColor: '#1e1e2e' }}>
          <div className="px-4 pt-4 pb-3 border-b sticky top-0 z-10" style={{ backgroundColor: '#0a0a0f', borderColor: '#1e1e2e' }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{currentStage.icon}</span>
              <span className="font-semibold text-sm">{currentStage.label}</span>
            </div>
            <p className="text-xs" style={{ color: '#6b6b80' }}>Agent: <span style={{ color: currentStage.color }}>{currentStage.agent}</span> · {stageLeads.length} lead{stageLeads.length !== 1 ? 's' : ''}</p>
          </div>

          {stageLeads.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-center p-6">
              <div>
                <span className="text-3xl">⏳</span>
                <p className="text-sm mt-2" style={{ color: '#6b6b80' }}>No leads at this stage yet.</p>
                <p className="text-xs mt-1" style={{ color: '#44445a' }}>{currentStage.agent} is working.</p>
              </div>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: '#1e1e2e' }}>
              {stageLeads.map(lead => {
                const h = heat(lead.score)
                const selected = selectedLead?.id === lead.id
                return (
                  <button
                    key={lead.id}
                    onClick={() => setSelectedLead(lead)}
                    className="w-full text-left px-4 py-4 transition-all"
                    style={{ backgroundColor: selected ? 'rgba(255,255,255,0.03)' : 'transparent', borderLeft: selected ? `3px solid ${currentStage.color}` : '3px solid transparent' }}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{lead.first_name} {lead.last_name}</p>
                        <p className="text-xs truncate" style={{ color: '#6b6b80' }}>{lead.title}</p>
                        <p className="text-xs truncate" style={{ color: '#6b6b80' }}>{lead.company}</p>
                      </div>
                      <span className="text-xs font-bold shrink-0 px-2 py-0.5 rounded-full" style={{ backgroundColor: h.bg, color: h.color }}>
                        {h.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex items-center gap-1">
                        <div className="h-1 w-16 rounded-full overflow-hidden" style={{ backgroundColor: '#1a1a24' }}>
                          <div className="h-full rounded-full" style={{ width: `${lead.score * 10}%`, backgroundColor: h.color }} />
                        </div>
                        <span className="text-xs" style={{ color: '#44445a' }}>{lead.score}/10</span>
                      </div>
                      <span className="text-xs" style={{ color: '#44445a' }}>{lead.location}</span>
                    </div>
                    <div className="mt-2 text-xs" style={{ color: '#44445a' }}>
                      ICP match: <span style={{ color: currentStage.color }}>{lead.icp_match}%</span>
                    </div>
                    {(lead as typeof LEADS[0] & { meeting_booked?: boolean }).meeting_booked && (
                      <div className="mt-2 text-xs px-2 py-1 rounded" style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                        📅 Meeting booked
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {/* ── RIGHT — LEAD DETAIL + CHAT ── */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {!selectedLead ? (
            <div className="flex-1 flex items-center justify-center text-center p-8">
              <div>
                <div className="text-5xl mb-4">{currentStage.icon}</div>
                <h2 className="text-xl font-bold mb-2">{currentStage.label}</h2>
                <p className="text-sm mb-1" style={{ color: '#6b6b80' }}>Powered by <span style={{ color: currentStage.color }}>{currentStage.agent}</span></p>
                <p className="text-sm max-w-sm mx-auto mt-3" style={{ color: '#44445a' }}>
                  Select a lead from the list to see their full AI-generated profile, messages, whitepaper, and personalized landing page.
                </p>
                {stageLeads.length === 0 && (
                  <p className="text-xs mt-4 px-4 py-2 rounded-lg inline-block" style={{ backgroundColor: '#111118', color: '#6b6b80' }}>
                    No leads at this stage — select another stage to explore.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Lead header */}
              <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#1e1e2e', backgroundColor: '#0d0d14' }}>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0" style={{ backgroundColor: currentStage.color + '20', color: currentStage.color }}>
                    {selectedLead.first_name[0]}{selectedLead.last_name[0]}
                  </div>
                  <div>
                    <h2 className="font-bold text-base">{selectedLead.first_name} {selectedLead.last_name}</h2>
                    <p className="text-xs" style={{ color: '#6b6b80' }}>{selectedLead.title} · {selectedLead.company} · {selectedLead.location}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(selectedLead as typeof LEADS[0] & { meeting_booked?: boolean }).meeting_booked && (
                    <span className="text-xs px-3 py-1 rounded-full font-semibold" style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                      📅 {(selectedLead as typeof LEADS[0] & { meeting_date?: string }).meeting_date}
                    </span>
                  )}
                  <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: heat(selectedLead.score).bg, color: heat(selectedLead.score).color }}>
                    Score {selectedLead.score}/10
                  </span>
                </div>
              </div>

              {/* Tabs */}
              <div className="shrink-0 flex border-b px-6 gap-1 overflow-x-auto" style={{ borderColor: '#1e1e2e', backgroundColor: '#0d0d14' }}>
                {[
                  { id: 'profile', label: '👤 Profile' },
                  { id: 'linkedin', label: '💼 LinkedIn', show: !!selectedLead.linkedin_msg },
                  { id: 'email', label: '✉️ Email', show: !!selectedLead.email },
                  { id: 'whitepaper', label: '📄 Whitepaper', show: !!selectedLead.whitepaper },
                  { id: 'landing', label: '🌐 Landing Page', show: !!selectedLead.landing_url },
                  { id: 'chat', label: `💬 ${currentStage.agent}` },
                ].filter(t => t.show !== false).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                    className="shrink-0 text-xs font-medium py-3 px-3 border-b-2 transition-all"
                    style={{
                      borderColor: activeTab === tab.id ? currentStage.color : 'transparent',
                      color: activeTab === tab.id ? '#e2e2ef' : '#6b6b80',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto">

                {/* PROFILE TAB */}
                {activeTab === 'profile' && (
                  <div className="p-6 space-y-5 max-w-2xl">
                    <div className="grid grid-cols-2 gap-4">
                      <Card label="ICP Match" value={`${selectedLead.icp_match}%`} color={currentStage.color} />
                      <Card label="Employees" value={`~${selectedLead.employees}`} />
                      <Card label="Website" value={selectedLead.website} color="#6b6b80" />
                      <Card label="LinkedIn" value="View profile →" color="#0ea5e9" />
                    </div>
                    <Section label="Why this lead?">
                      <p className="text-sm leading-relaxed" style={{ color: '#a0a0b0' }}>{selectedLead.icp_reason}</p>
                    </Section>
                    {selectedLead.enrichment && (
                      <>
                        <Section label="Company Summary">
                          <p className="text-sm leading-relaxed" style={{ color: '#a0a0b0' }}>{selectedLead.enrichment.company_summary}</p>
                        </Section>
                        <Section label="Key Challenges">
                          <ul className="space-y-2">
                            {selectedLead.enrichment.key_challenges.map((c, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm" style={{ color: '#a0a0b0' }}>
                                <span style={{ color: '#ef4444', marginTop: 2 }}>↳</span> {c}
                              </li>
                            ))}
                          </ul>
                        </Section>
                        <Section label="Persuasion Profile">
                          <span className="text-sm font-bold px-3 py-1 rounded-full capitalize" style={{ backgroundColor: profileColor(selectedLead.enrichment.persuasion_profile) + '20', color: profileColor(selectedLead.enrichment.persuasion_profile) }}>
                            {selectedLead.enrichment.persuasion_profile}
                          </span>
                        </Section>
                        <Section label="Conversation Hooks">
                          <ul className="space-y-2">
                            {selectedLead.enrichment.conversation_hooks.map((h, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm" style={{ color: '#a0a0b0' }}>
                                <span style={{ color: '#00d4aa' }}>→</span> {h}
                              </li>
                            ))}
                          </ul>
                        </Section>
                      </>
                    )}
                    {(selectedLead as typeof LEADS[0] & { website_intel?: Record<string, string> }).website_intel && (
                      <Section label="Website Intelligence">
                        <div className="space-y-2 text-sm" style={{ color: '#a0a0b0' }}>
                          {Object.entries((selectedLead as typeof LEADS[0] & { website_intel?: Record<string, string> }).website_intel!).map(([k, v]) => (
                            <div key={k} className="flex gap-2">
                              <span className="capitalize" style={{ color: '#44445a', minWidth: 120 }}>{k.replace(/_/g, ' ')}:</span>
                              <span>{Array.isArray(v) ? (v as string[]).join(', ') : v}</span>
                            </div>
                          ))}
                        </div>
                      </Section>
                    )}
                  </div>
                )}

                {/* LINKEDIN TAB */}
                {activeTab === 'linkedin' && selectedLead.linkedin_msg && (
                  <div className="p-6 max-w-2xl">
                    <div className="rounded-xl border p-5" style={{ backgroundColor: '#111118', borderColor: '#1e1e2e' }}>
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-lg">💼</span>
                        <span className="text-sm font-semibold">LinkedIn Message — Generated by Vincent</span>
                        <span className="text-xs px-2 py-0.5 rounded-full ml-auto" style={{ backgroundColor: 'rgba(14,165,233,0.1)', color: '#0ea5e9' }}>Pending review</span>
                      </div>
                      <div className="rounded-lg p-4 text-sm leading-relaxed whitespace-pre-line" style={{ backgroundColor: '#0d0d14', color: '#d0d0e0', fontFamily: 'Georgia, serif' }}>
                        {selectedLead.linkedin_msg}
                      </div>
                      <div className="flex items-center gap-3 mt-4">
                        <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold" style={{ backgroundColor: '#00d4aa', color: '#0a0a0f' }}>
                          ✓ Approve & send
                        </button>
                        <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm" style={{ backgroundColor: '#1a1a24', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                          ✗ Reject
                        </button>
                        <button className="text-xs ml-auto" style={{ color: '#6b6b80' }}>Regenerate</button>
                      </div>
                    </div>
                    <p className="text-xs mt-4" style={{ color: '#44445a' }}>
                      Vincent will send this via PhantomBuster using your LinkedIn session. Max 1 message/day per lead. 6-day cooldown enforced.
                    </p>
                  </div>
                )}

                {/* EMAIL TAB */}
                {activeTab === 'email' && selectedLead.email && (
                  <div className="p-6 max-w-2xl">
                    <div className="rounded-xl border p-5" style={{ backgroundColor: '#111118', borderColor: '#1e1e2e' }}>
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-lg">✉️</span>
                        <span className="text-sm font-semibold">Email — Generated by Outreach AI</span>
                        <span className="text-xs px-2 py-0.5 rounded-full ml-auto" style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>Sent via Resend</span>
                      </div>
                      <div className="rounded-lg p-4 text-sm leading-relaxed whitespace-pre-line" style={{ backgroundColor: '#0d0d14', color: '#d0d0e0', fontFamily: 'Georgia, serif', lineHeight: 1.7 }}>
                        {selectedLead.email}
                      </div>
                    </div>
                  </div>
                )}

                {/* WHITEPAPER TAB */}
                {activeTab === 'whitepaper' && selectedLead.whitepaper && (
                  <div className="p-6 max-w-2xl">
                    <div className="rounded-xl border p-5" style={{ backgroundColor: '#111118', borderColor: '#1e1e2e' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">📄</span>
                        <span className="text-sm font-semibold">AI-Generated Whitepaper</span>
                      </div>
                      <p className="text-xs mb-4" style={{ color: '#6b6b80' }}>Personalized for {selectedLead.first_name} {selectedLead.last_name} at {selectedLead.company}</p>
                      <div className="rounded-lg p-5 border" style={{ backgroundColor: '#0d0d14', borderColor: '#1e1e2e' }}>
                        <h3 className="font-bold text-base leading-snug mb-3" style={{ color: '#e2e2ef' }}>
                          {selectedLead.whitepaper.title}
                        </h3>
                        <p className="text-sm leading-relaxed mb-4" style={{ color: '#a0a0b0' }}>{selectedLead.whitepaper.summary}</p>
                        <div className="text-xs font-mono px-3 py-2 rounded" style={{ backgroundColor: '#1a1a24', color: '#00d4aa' }}>
                          🔗 {selectedLead.whitepaper.url}
                        </div>
                      </div>
                      <div className="flex gap-3 mt-4">
                        <button className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ backgroundColor: '#00d4aa', color: '#0a0a0f' }}>
                          View full whitepaper →
                        </button>
                        <button className="px-4 py-2 rounded-lg text-sm" style={{ backgroundColor: '#1a1a24', color: '#a0a0b0' }}>
                          Copy link
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* LANDING PAGE TAB */}
                {activeTab === 'landing' && selectedLead.landing_url && (
                  <div className="p-6 max-w-2xl">
                    <div className="rounded-xl border p-5" style={{ backgroundColor: '#111118', borderColor: '#1e1e2e' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">🌐</span>
                        <span className="text-sm font-semibold">Personalized Landing Page</span>
                      </div>
                      <p className="text-xs mb-5" style={{ color: '#6b6b80' }}>Built specifically for {selectedLead.first_name} at {selectedLead.company}. Unique URL with personalized content, ROI calculator, and direct booking link.</p>

                      <div className="text-xs font-mono px-3 py-2 rounded mb-5" style={{ backgroundColor: '#1a1a24', color: '#00d4aa' }}>
                        🔗 {selectedLead.landing_url}
                      </div>

                      <div className="space-y-3 text-sm" style={{ color: '#a0a0b0' }}>
                        {[
                          ['Headline', `How ${selectedLead.company} can reclaim 8+ hours/week in ops overhead`],
                          ['Pain section', `Specific to their ${selectedLead.enrichment?.key_challenges?.[0] || 'top challenge'}`],
                          ['Persuasion', `Written for ${selectedLead.enrichment?.persuasion_profile || 'their'} profile`],
                          ['CTA', 'Book 20-minute call → Calendly'],
                          ['ROI calculator', 'Pre-filled with company size & industry benchmarks'],
                        ].map(([label, val]) => (
                          <div key={label} className="flex gap-3">
                            <span style={{ color: '#44445a', minWidth: 110 }}>{label}:</span>
                            <span>{val}</span>
                          </div>
                        ))}
                      </div>

                      <button className="mt-5 px-4 py-2 rounded-lg text-sm font-semibold w-full" style={{ backgroundColor: '#00d4aa', color: '#0a0a0f' }}>
                        Preview landing page →
                      </button>
                    </div>
                  </div>
                )}

                {/* CHAT TAB */}
                {activeTab === 'chat' && (
                  <div className="flex flex-col h-full">
                    <div ref={chatRef} className="flex-1 overflow-y-auto p-5 space-y-4">
                      {chat.length === 0 && (
                        <div className="text-center py-8">
                          <span className="text-3xl">💬</span>
                          <p className="text-sm mt-3 font-semibold">{currentStage.agent}</p>
                          <p className="text-xs mt-1 max-w-xs mx-auto" style={{ color: '#6b6b80' }}>
                            Ask me anything about {selectedLead.first_name} {selectedLead.last_name} or what I should do next.
                          </p>
                          <div className="mt-4 flex flex-wrap gap-2 justify-center">
                            {[
                              `Why is ${selectedLead.first_name} a good fit?`,
                              'What should I say first?',
                              'What\'s the best angle for this lead?',
                            ].map(q => (
                              <button key={q} onClick={() => { setChatInput(q); setTimeout(() => sendChat(), 50) }} className="text-xs px-3 py-1.5 rounded-full" style={{ backgroundColor: '#1a1a24', color: '#a0a0b0', border: '1px solid #1e1e2e' }}>
                                {q}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {chat.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className="max-w-md text-sm rounded-2xl px-4 py-3 leading-relaxed" style={{
                            backgroundColor: msg.role === 'user' ? currentStage.color : '#111118',
                            color: msg.role === 'user' ? '#0a0a0f' : '#d0d0e0',
                          }}>
                            {msg.content}
                          </div>
                        </div>
                      ))}
                      {chatLoading && (
                        <div className="flex justify-start">
                          <div className="text-sm rounded-2xl px-4 py-3" style={{ backgroundColor: '#111118', color: '#6b6b80' }}>
                            <span className="animate-pulse">{currentStage.agent} is thinking…</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 p-4 border-t" style={{ borderColor: '#1e1e2e' }}>
                      <div className="flex gap-2">
                        <input
                          value={chatInput}
                          onChange={e => setChatInput(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
                          placeholder={`Ask ${currentStage.agent}…`}
                          className="flex-1 text-sm px-4 py-2.5 rounded-xl outline-none"
                          style={{ backgroundColor: '#111118', border: '1px solid #1e1e2e', color: '#e2e2ef' }}
                        />
                        <button
                          onClick={sendChat}
                          disabled={chatLoading || !chatInput.trim()}
                          className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
                          style={{ backgroundColor: currentStage.color, color: '#0a0a0f' }}
                        >
                          Send
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

/* ── SMALL COMPONENTS ── */
function Card({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl p-4 border" style={{ backgroundColor: '#111118', borderColor: '#1e1e2e' }}>
      <p className="text-xs mb-1" style={{ color: '#44445a' }}>{label}</p>
      <p className="text-sm font-semibold" style={{ color: color || '#e2e2ef' }}>{value}</p>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-4" style={{ backgroundColor: '#111118', borderColor: '#1e1e2e' }}>
      <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#44445a' }}>{label}</p>
      {children}
    </div>
  )
}
