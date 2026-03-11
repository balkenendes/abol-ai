import { Megaphone, Clock } from 'lucide-react'

export default function CampaignsPage() {
  return (
    <div className="p-6 md:p-8 pt-20 md:pt-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-2">Campaigns</h1>
      <p className="text-sm mb-12" style={{ color: '#a0a0b0' }}>
        Automated multi-channel outreach sequences.
      </p>

      <div className="text-center py-20">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
          style={{ backgroundColor: '#1a1a24', border: '1px solid #222233' }}
        >
          <Megaphone className="w-10 h-10" style={{ color: '#555566' }} />
        </div>
        <div className="flex items-center justify-center gap-2 mb-3">
          <Clock className="w-4 h-4" style={{ color: '#00d4aa' }} />
          <span className="text-sm font-semibold" style={{ color: '#00d4aa' }}>Coming Soon</span>
        </div>
        <h2 className="text-xl font-bold text-white mb-3">Automated Campaign Sequences</h2>
        <p className="text-sm max-w-md mx-auto leading-relaxed" style={{ color: '#a0a0b0' }}>
          Set up fully automated LinkedIn + email sequences that run on autopilot.
          AI will personalize each touchpoint based on lead behavior and responses.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {['Multi-channel automation', 'Smart send timing', 'Reply detection', 'A/B testing'].map(f => (
            <span
              key={f}
              className="px-3 py-1.5 rounded-full text-xs"
              style={{
                backgroundColor: '#1a1a24',
                color: '#a0a0b0',
                border: '1px solid #222233',
              }}
            >
              {f}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
