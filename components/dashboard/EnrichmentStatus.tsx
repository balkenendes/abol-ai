'use client'

import { useState } from 'react'

interface EnrichmentStatusProps {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  leadId: string
  onRetrySuccess?: () => void
}

export function EnrichmentStatus({ status, leadId, onRetrySuccess }: EnrichmentStatusProps) {
  const [retrying, setRetrying] = useState(false)
  const [currentStatus, setCurrentStatus] = useState(status)

  async function handleRetry() {
    setRetrying(true)
    try {
      const res = await fetch('/api/leads/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId }),
      })
      if (res.ok) {
        setCurrentStatus('processing')
        onRetrySuccess?.()
      }
    } catch (err) {
      console.error('Retry failed:', err)
    } finally {
      setRetrying(false)
    }
  }

  if (currentStatus === 'completed') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#00d4aa]">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        Enriched
      </span>
    )
  }

  if (currentStatus === 'processing') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#00d4aa]">
        <span
          className="w-2 h-2 rounded-full animate-pulse"
          style={{ backgroundColor: '#00d4aa' }}
        />
        Enriching...
      </span>
    )
  }

  if (currentStatus === 'failed') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-400">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
        Failed
        <button
          onClick={handleRetry}
          disabled={retrying}
          className="ml-1 text-[#00d4aa] underline text-xs hover:no-underline disabled:opacity-50"
        >
          {retrying ? 'Retrying...' : 'Retry'}
        </button>
      </span>
    )
  }

  // pending
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#555566]">
      <span className="w-2 h-2 rounded-full bg-[#555566]" />
      Pending
    </span>
  )
}
