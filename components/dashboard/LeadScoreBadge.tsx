interface LeadScoreBadgeProps {
  score: number
}

export function LeadScoreBadge({ score }: LeadScoreBadgeProps) {
  if (score >= 9) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold"
        style={{
          backgroundColor: 'rgba(0, 212, 170, 0.15)',
          color: '#00d4aa',
          border: '1px solid rgba(0, 212, 170, 0.4)',
          boxShadow: '0 0 8px rgba(0, 212, 170, 0.3)',
        }}
      >
        {score} Warm 🔥
      </span>
    )
  }

  if (score >= 7) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold"
        style={{
          backgroundColor: 'rgba(249, 115, 22, 0.15)',
          color: '#fb923c',
          border: '1px solid rgba(249, 115, 22, 0.3)',
        }}
      >
        {score} Engaged
      </span>
    )
  }

  if (score >= 4) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold"
        style={{
          backgroundColor: 'rgba(234, 179, 8, 0.15)',
          color: '#facc15',
          border: '1px solid rgba(234, 179, 8, 0.3)',
        }}
      >
        {score} Warming
      </span>
    )
  }

  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold"
      style={{
        backgroundColor: '#1a1a24',
        color: '#555566',
        border: '1px solid #222233',
      }}
    >
      {score} Cold
    </span>
  )
}
