'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle2, XCircle, Edit2, Clock, Linkedin, Mail, RefreshCw } from 'lucide-react'

interface ReviewItem {
  id: string
  status: string
  created_at: string
  lead_id: string
  message_id: string
  outreach_messages: {
    channel: string
    content: string
    subject: string | null
    status: string
  }
  leads: {
    first_name: string
    last_name: string
    company: string
    title: string | null
    linkedin_url: string | null
    persuasion_profile: string | null
  }
}

const CHANNEL_LABELS: Record<string, string> = {
  linkedin_request: 'LinkedIn Request',
  linkedin_dm: 'LinkedIn DM',
  email_1: 'Email 1',
  email_2: 'Email 2',
  email_3: 'Email 3',
  email_4: 'Email 4',
}

function ChannelBadge({ channel }: { channel: string }) {
  const isLinkedIn = channel.startsWith('linkedin')
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
      style={{
        backgroundColor: isLinkedIn ? 'rgba(0,119,181,0.15)' : 'rgba(0,212,170,0.1)',
        color: isLinkedIn ? '#0088cc' : '#00d4aa',
      }}
    >
      {isLinkedIn ? <Linkedin className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
      {CHANNEL_LABELS[channel] ?? channel}
    </span>
  )
}

export default function ReviewPage() {
  const [items, setItems] = useState<ReviewItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [editedContent, setEditedContent] = useState<Record<string, string>>({})
  const [processing, setProcessing] = useState<string | null>(null)
  const [tab, setTab] = useState<'pending' | 'reviewed'>('pending')
  const supabase = createClient()

  const loadReviews = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('review_queue')
      .select(`
        id, status, created_at, lead_id, message_id,
        outreach_messages(channel, content, subject, status),
        leads(first_name, last_name, company, title, linkedin_url, persuasion_profile)
      `)
      .eq('status', tab === 'pending' ? 'pending' : 'approved,rejected,edited')
      .order('created_at', { ascending: false })
      .limit(50)

    setItems((data as ReviewItem[] | null) ?? [])
    setLoading(false)
  }, [supabase, tab])

  useEffect(() => {
    void loadReviews()
  }, [loadReviews])

  async function handleApprove(item: ReviewItem) {
    setProcessing(item.id)
    try {
      const res = await fetch('/api/review/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewId: item.id,
          editedContent: editedContent[item.id],
        }),
      })
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== item.id))
        setEditing(null)
        const edited = { ...editedContent }
        delete edited[item.id]
        setEditedContent(edited)
      }
    } finally {
      setProcessing(null)
    }
  }

  async function handleReject(item: ReviewItem) {
    setProcessing(item.id)
    try {
      const res = await fetch('/api/review/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId: item.id }),
      })
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== item.id))
      }
    } finally {
      setProcessing(null)
    }
  }

  const pendingCount = items.filter(i => i.status === 'pending').length

  return (
    <div className="p-6 md:p-8 pt-20 md:pt-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            Review Queue
            {pendingCount > 0 && (
              <span
                className="text-sm px-2 py-0.5 rounded-full font-semibold"
                style={{ backgroundColor: 'rgba(249,115,22,0.15)', color: '#fb923c' }}
              >
                {pendingCount}
              </span>
            )}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: '#a0a0b0' }}>
            Review and approve outreach before it is sent
          </p>
        </div>
        <button
          onClick={() => void loadReviews()}
          className="p-2 rounded-lg transition-colors"
          style={{ color: '#555566', border: '1px solid #222233' }}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex rounded-lg p-1 mb-6 w-fit" style={{ backgroundColor: '#1a1a24' }}>
        {(['pending', 'reviewed'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2 rounded-md text-sm font-medium transition-colors capitalize"
            style={{
              backgroundColor: tab === t ? '#111118' : 'transparent',
              color: tab === t ? '#ffffff' : '#555566',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Items */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className="rounded-xl p-6 animate-pulse"
              style={{ backgroundColor: '#111118', border: '1px solid #222233', height: '180px' }}
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-4" style={{ color: '#222233' }} />
          <p className="text-lg font-medium text-white mb-1">
            {tab === 'pending' ? 'Nothing to review' : 'No reviewed items'}
          </p>
          <p className="text-sm" style={{ color: '#555566' }}>
            {tab === 'pending'
              ? 'AI will add messages here as leads are enriched'
              : 'Approved and rejected messages appear here'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map(item => {
            const msg = item.outreach_messages
            const lead = item.leads
            const isEditing = editing === item.id
            const currentContent = editedContent[item.id] ?? msg.content
            const isProcessing = processing === item.id

            return (
              <div
                key={item.id}
                className="rounded-xl p-6 transition-all"
                style={{ backgroundColor: '#111118', border: '1px solid #222233' }}
              >
                {/* Lead + channel */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-white">
                        {lead.first_name} {lead.last_name}
                      </span>
                      {lead.linkedin_url && (
                        <a
                          href={lead.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="opacity-50 hover:opacity-100 transition-opacity"
                          style={{ color: '#0088cc' }}
                        >
                          <Linkedin className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                    <p className="text-sm" style={{ color: '#a0a0b0' }}>
                      {lead.title ? `${lead.title} · ` : ''}{lead.company}
                    </p>
                    {lead.persuasion_profile && (
                      <p className="text-xs mt-0.5 capitalize" style={{ color: '#555566' }}>
                        Profile: {lead.persuasion_profile}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <ChannelBadge channel={msg.channel} />
                    <span className="text-xs" style={{ color: '#555566' }}>
                      <Clock className="w-3 h-3 inline mr-1" />
                      {new Date(item.created_at).toLocaleDateString('nl-NL')}
                    </span>
                  </div>
                </div>

                {/* Subject (email only) */}
                {msg.subject && (
                  <div
                    className="px-3 py-1.5 rounded-md mb-3 text-sm"
                    style={{ backgroundColor: '#1a1a24' }}
                  >
                    <span style={{ color: '#555566' }}>Subject: </span>
                    <span className="text-white">{msg.subject}</span>
                  </div>
                )}

                {/* Message content */}
                {isEditing ? (
                  <textarea
                    value={currentContent}
                    onChange={e => setEditedContent(prev => ({ ...prev, [item.id]: e.target.value }))}
                    rows={6}
                    className="w-full px-4 py-3 rounded-lg text-sm text-white outline-none resize-none"
                    style={{
                      backgroundColor: '#1a1a24',
                      border: '1px solid #00d4aa',
                      lineHeight: '1.6',
                    }}
                  />
                ) : (
                  <div
                    className="px-4 py-3 rounded-lg text-sm whitespace-pre-wrap"
                    style={{
                      backgroundColor: '#1a1a24',
                      color: '#d0d0e0',
                      lineHeight: '1.6',
                    }}
                  >
                    {currentContent}
                  </div>
                )}

                {/* Char count for LinkedIn */}
                {msg.channel === 'linkedin_request' && (
                  <p
                    className="text-xs mt-1 text-right"
                    style={{ color: currentContent.length > 300 ? '#ef4444' : '#555566' }}
                  >
                    {currentContent.length} / 300 chars
                  </p>
                )}

                {/* Actions */}
                {tab === 'pending' && (
                  <div className="flex items-center gap-3 mt-4">
                    <button
                      onClick={() => void handleApprove(item)}
                      disabled={isProcessing || (msg.channel === 'linkedin_request' && currentContent.length > 300)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                      style={{ backgroundColor: '#00d4aa', color: '#0a0a0f' }}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {isProcessing ? 'Processing...' : 'Approve & Send'}
                    </button>
                    <button
                      onClick={() => {
                        if (isEditing) {
                          setEditing(null)
                        } else {
                          setEditing(item.id)
                          setEditedContent(prev => ({ ...prev, [item.id]: msg.content }))
                        }
                      }}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      style={{
                        backgroundColor: isEditing ? 'rgba(0,212,170,0.1)' : '#1a1a24',
                        color: isEditing ? '#00d4aa' : '#a0a0b0',
                        border: '1px solid #222233',
                      }}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      {isEditing ? 'Done editing' : 'Edit'}
                    </button>
                    <button
                      onClick={() => void handleReject(item)}
                      disabled={isProcessing}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
