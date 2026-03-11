'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { LeadScoreBadge } from '@/components/dashboard/LeadScoreBadge'
import { EnrichmentStatus } from '@/components/dashboard/EnrichmentStatus'
import {
  ArrowLeft,
  ExternalLink,
  Copy,
  CheckCheck,
  RefreshCw,
  Loader2,
  Brain,
  MessageSquare,
  User,
} from 'lucide-react'

interface Lead {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  company: string | null
  title: string | null
  linkedin_url: string | null
  website: string | null
  stage: string | null
  engagement_score: number | null
  enrichment_status: string | null
  enrichment_data: EnrichmentData | null
  persuasion_profile: string | null
  notes: string | null
  enriched_at: string | null
}

interface EnrichmentData {
  company_summary?: string
  what_they_sell?: string
  target_market?: string
  company_size_estimate?: string
  tech_stack_signals?: string[]
  key_challenges?: string[]
  persuasion_profile?: string
  persuasion_reasoning?: string
  conversation_hooks?: string[]
}

interface OutreachMessage {
  id: string
  channel: string
  subject: string | null
  content: string
  status: string
  sent_at: string | null
  opened_at: string | null
  replied_at: string | null
}

const CHANNEL_LABELS: Record<string, string> = {
  linkedin_request: 'LinkedIn Connection Request',
  linkedin_dm: 'LinkedIn DM',
  email_1: 'Email 1 (Day 8)',
  email_2: 'Email 2 (Day 12)',
  email_3: 'Email 3 (Day 17)',
  email_4: 'Email 4 (Day 22)',
}

const STAGES = ['new', 'enriched', 'contacted', 'connected', 'engaged', 'warm', 'meeting_booked', 'closed_won', 'closed_lost']
const STAGE_LABELS: Record<string, string> = {
  new: 'New',
  enriched: 'Enriched',
  contacted: 'Contacted',
  connected: 'Connected',
  engaged: 'Engaged',
  warm: 'Warm',
  meeting_booked: 'Meeting Booked',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors"
      style={{
        backgroundColor: '#1a1a24',
        color: copied ? '#00d4aa' : '#a0a0b0',
        border: '1px solid #222233',
      }}
    >
      {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [lead, setLead] = useState<Lead | null>(null)
  const [messages, setMessages] = useState<OutreachMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'messages' | 'activity'>('overview')
  const [updatingStage, setUpdatingStage] = useState(false)
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [markingSent, setMarkingSent] = useState<string | null>(null)

  const fetchLead = useCallback(async () => {
    const { data } = await supabase
      .from('leads')
      .select('*')
      .eq('id', id)
      .single()

    if (data) {
      setLead(data as Lead)
      setNotes(data.notes ?? '')
    }
  }, [id, supabase])

  const fetchMessages = useCallback(async () => {
    const { data } = await supabase
      .from('outreach_messages')
      .select('*')
      .eq('lead_id', id)
      .order('created_at', { ascending: true })

    setMessages((data as OutreachMessage[]) ?? [])
  }, [id, supabase])

  useEffect(() => {
    async function load() {
      setLoading(true)
      await Promise.all([fetchLead(), fetchMessages()])
      setLoading(false)
    }
    void load()
  }, [fetchLead, fetchMessages])

  async function updateStage(newStage: string) {
    if (!lead) return
    setUpdatingStage(true)
    const isWarm = ['warm', 'meeting_booked', 'closed_won'].includes(newStage)
    await supabase
      .from('leads')
      .update({ stage: newStage, is_warm: isWarm, updated_at: new Date().toISOString() })
      .eq('id', id)
    setLead({ ...lead, stage: newStage })
    setUpdatingStage(false)
  }

  async function saveNotes() {
    if (!lead) return
    setSavingNotes(true)
    await supabase.from('leads').update({ notes }).eq('id', id)
    setSavingNotes(false)
  }

  async function regenerateMessages() {
    setRegenerating(true)
    try {
      await fetch('/api/ai/generate-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: id }),
      })
      await fetchMessages()
    } catch (err) {
      console.error(err)
    } finally {
      setRegenerating(false)
    }
  }

  async function markAsSent(messageId: string) {
    setMarkingSent(messageId)
    await supabase
      .from('outreach_messages')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', messageId)
    await fetchMessages()
    setMarkingSent(null)
  }

  if (loading) {
    return (
      <div className="p-6 md:p-8 pt-20 md:pt-8 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-24 mb-4" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!lead) {
    return (
      <div className="p-8 pt-20 md:pt-8 text-center">
        <p className="text-white">Lead not found.</p>
        <Button onClick={() => router.push('/dashboard/leads')} variant="outline" className="mt-4">
          Back to Leads
        </Button>
      </div>
    )
  }

  const enrichData = lead.enrichment_data

  return (
    <div className="p-6 md:p-8 pt-20 md:pt-8 max-w-4xl mx-auto">
      {/* Back button */}
      <button
        onClick={() => router.push('/dashboard/leads')}
        className="flex items-center gap-2 text-sm mb-6 transition-colors"
        style={{ color: '#a0a0b0' }}
        onMouseEnter={e => { e.currentTarget.style.color = 'white' }}
        onMouseLeave={e => { e.currentTarget.style.color = '#a0a0b0' }}
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Leads
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold shrink-0"
            style={{ backgroundColor: '#1a1a24', color: '#00d4aa', border: '1px solid #222233' }}
          >
            {(lead.first_name?.[0] ?? '?').toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">
              {lead.first_name} {lead.last_name}
            </h1>
            <p style={{ color: '#a0a0b0' }} className="text-sm">
              {lead.title ? `${lead.title} · ` : ''}{lead.company}
            </p>
            <div className="flex items-center gap-3 mt-1.5">
              {lead.email && (
                <a href={`mailto:${lead.email}`} className="text-xs" style={{ color: '#555566' }}>
                  {lead.email}
                </a>
              )}
              {lead.linkedin_url && (
                <a
                  href={lead.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs transition-colors"
                  style={{ color: '#555566' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#00d4aa' }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#555566' }}
                >
                  <ExternalLink className="w-3 h-3" />
                  LinkedIn
                </a>
              )}
            </div>
          </div>
        </div>
        <LeadScoreBadge score={lead.engagement_score ?? 0} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg w-fit" style={{ backgroundColor: '#1a1a24' }}>
        {([
          { key: 'overview', label: 'Overview', icon: User },
          { key: 'messages', label: 'Outreach Messages', icon: MessageSquare },
          { key: 'activity', label: 'Activity', icon: Brain },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors"
            style={{
              backgroundColor: activeTab === key ? '#111118' : 'transparent',
              color: activeTab === key ? 'white' : '#a0a0b0',
            }}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Enrichment card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">AI Research</CardTitle>
                <EnrichmentStatus
                  status={(lead.enrichment_status as 'pending' | 'processing' | 'completed' | 'failed') ?? 'pending'}
                  leadId={lead.id}
                  onRetrySuccess={fetchLead}
                />
              </div>
            </CardHeader>
            <CardContent>
              {!enrichData ? (
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              ) : (
                <div className="space-y-4">
                  {enrichData.company_summary && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#555566' }}>
                        Company Summary
                      </p>
                      <p className="text-sm" style={{ color: '#a0a0b0' }}>{enrichData.company_summary}</p>
                    </div>
                  )}
                  {enrichData.key_challenges && enrichData.key_challenges.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#555566' }}>
                        Key Challenges
                      </p>
                      <ul className="space-y-1">
                        {enrichData.key_challenges.map((c, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm" style={{ color: '#a0a0b0' }}>
                            <span style={{ color: '#00d4aa' }}>·</span>
                            {c}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {enrichData.conversation_hooks && enrichData.conversation_hooks.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#555566' }}>
                        Conversation Hooks
                      </p>
                      <ul className="space-y-1">
                        {enrichData.conversation_hooks.map((h, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm" style={{ color: '#a0a0b0' }}>
                            <span style={{ color: '#00d4aa' }}>→</span>
                            {h}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {enrichData.persuasion_profile && (
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#555566' }}>
                          Persuasion Profile
                        </p>
                        <span
                          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold capitalize"
                          style={{
                            backgroundColor: 'rgba(0,212,170,0.1)',
                            color: '#00d4aa',
                            border: '1px solid rgba(0,212,170,0.3)',
                          }}
                        >
                          {enrichData.persuasion_profile}
                        </span>
                      </div>
                      {enrichData.persuasion_reasoning && (
                        <p className="text-xs mt-4" style={{ color: '#555566' }}>
                          {enrichData.persuasion_reasoning}
                        </p>
                      )}
                    </div>
                  )}
                  {enrichData.tech_stack_signals && enrichData.tech_stack_signals.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#555566' }}>
                        Tech Stack
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {enrichData.tech_stack_signals.map((t, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded text-xs"
                            style={{ backgroundColor: '#1a1a24', color: '#a0a0b0', border: '1px solid #222233' }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stage & Score */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#555566' }}>
                  Stage
                </p>
                <select
                  value={lead.stage ?? 'new'}
                  onChange={e => updateStage(e.target.value)}
                  disabled={updatingStage}
                  className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none focus:ring-2 focus:ring-[#00d4aa] disabled:opacity-50"
                  style={{ backgroundColor: '#1a1a24', border: '1px solid #222233' }}
                >
                  {STAGES.map(s => (
                    <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                  ))}
                </select>
                {updatingStage && (
                  <p className="text-xs mt-1" style={{ color: '#555566' }}>Saving...</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#555566' }}>
                  Engagement Score
                </p>
                <div className="flex items-center gap-3">
                  <LeadScoreBadge score={lead.engagement_score ?? 0} />
                  <div className="flex-1 h-2 rounded-full" style={{ backgroundColor: '#1a1a24' }}>
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        width: `${(lead.engagement_score ?? 0) * 10}%`,
                        backgroundColor:
                          (lead.engagement_score ?? 0) >= 9 ? '#00d4aa' :
                          (lead.engagement_score ?? 0) >= 7 ? '#f97316' :
                          (lead.engagement_score ?? 0) >= 4 ? '#eab308' : '#555566',
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Notes */}
          <Card>
            <CardContent className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#555566' }}>
                Notes
              </p>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Add notes about this lead..."
                rows={4}
                className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder:text-[#555566] outline-none focus:ring-2 focus:ring-[#00d4aa] resize-none"
                style={{ backgroundColor: '#1a1a24', border: '1px solid #222233' }}
              />
              <Button
                onClick={saveNotes}
                disabled={savingNotes}
                variant="outline"
                size="sm"
                className="mt-2"
              >
                {savingNotes ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                Save Notes
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Messages Tab */}
      {activeTab === 'messages' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm" style={{ color: '#a0a0b0' }}>
              {messages.length} message{messages.length !== 1 ? 's' : ''} generated
            </p>
            <Button
              onClick={regenerateMessages}
              disabled={regenerating}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              {regenerating
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <RefreshCw className="w-3.5 h-3.5" />
              }
              Re-generate
            </Button>
          </div>

          {lead.enrichment_status !== 'completed' ? (
            <Card>
              <CardContent className="p-8 text-center">
                <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: '#1a1a24' }}>
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#00d4aa' }} />
                </div>
                <p className="text-sm font-medium text-white mb-1">Enrichment in progress...</p>
                <p className="text-xs" style={{ color: '#555566' }}>
                  Messages will be generated once AI finishes researching this lead.
                </p>
              </CardContent>
            </Card>
          ) : messages.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <MessageSquare className="w-8 h-8 mx-auto mb-3" style={{ color: '#222233' }} />
                <p className="text-sm font-medium text-white mb-1">No messages yet</p>
                <p className="text-xs mb-4" style={{ color: '#555566' }}>
                  Generate personalized outreach messages for this lead.
                </p>
                <Button onClick={regenerateMessages} disabled={regenerating} size="sm">
                  {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : null}
                  Generate Messages
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {(['linkedin_request', 'linkedin_dm', 'email_1', 'email_2', 'email_3', 'email_4'] as const).map(channel => {
                const msg = messages.find(m => m.channel === channel)
                if (!msg) return null

                return (
                  <Card key={channel}>
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white">
                            {CHANNEL_LABELS[channel]}
                          </span>
                          {msg.status === 'sent' && (
                            <span
                              className="text-xs px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: 'rgba(0,212,170,0.1)', color: '#00d4aa' }}
                            >
                              Sent
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <CopyButton text={msg.subject ? `Subject: ${msg.subject}\n\n${msg.content}` : msg.content} />
                          {msg.status !== 'sent' && (
                            <button
                              onClick={() => markAsSent(msg.id)}
                              disabled={markingSent === msg.id}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors"
                              style={{
                                backgroundColor: '#1a1a24',
                                color: '#a0a0b0',
                                border: '1px solid #222233',
                              }}
                            >
                              {markingSent === msg.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <CheckCheck className="w-3.5 h-3.5" />
                              }
                              Mark Sent
                            </button>
                          )}
                        </div>
                      </div>

                      {msg.subject && (
                        <div className="mb-2">
                          <p className="text-xs font-medium mb-0.5" style={{ color: '#555566' }}>Subject</p>
                          <p className="text-sm font-medium text-white">{msg.subject}</p>
                        </div>
                      )}

                      <div
                        className="rounded-lg p-3 text-sm leading-relaxed whitespace-pre-wrap"
                        style={{ backgroundColor: '#0a0a0f', color: '#a0a0b0', border: '1px solid #222233' }}
                      >
                        {msg.content}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Activity Tab */}
      {activeTab === 'activity' && (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-3">
              {messages.filter(m => m.status === 'sent').length === 0 && lead.enrichment_status !== 'completed' ? (
                <p className="text-sm text-center py-8" style={{ color: '#555566' }}>
                  No activity yet. Enrich this lead and send outreach to see activity here.
                </p>
              ) : (
                <>
                  {lead.enriched_at && (
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: '#00d4aa' }} />
                      <div>
                        <p className="text-sm text-white">Lead enriched by AI</p>
                        <p className="text-xs" style={{ color: '#555566' }}>
                          {new Date(lead.enriched_at).toLocaleDateString('en-US', {
                            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                  )}
                  {messages.filter(m => m.status === 'sent').map(msg => (
                    <div key={msg.id} className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: '#a78bfa' }} />
                      <div>
                        <p className="text-sm text-white">
                          {CHANNEL_LABELS[msg.channel]} marked as sent
                        </p>
                        <p className="text-xs" style={{ color: '#555566' }}>
                          {msg.sent_at ? new Date(msg.sent_at).toLocaleDateString('en-US', {
                            year: 'numeric', month: 'short', day: 'numeric',
                          }) : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
