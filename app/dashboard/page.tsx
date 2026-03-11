import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LeadScoreBadge } from '@/components/dashboard/LeadScoreBadge'
import { Users, TrendingUp, Flame, MessageSquare, ArrowRight, Clock } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: profile }, { data: stats }, { data: warmLeads }, { data: recentLeads }] =
    await Promise.all([
      supabase
        .from('users')
        .select('company_name, name, onboarding_completed, plan_tier, trial_ends_at')
        .eq('id', user.id)
        .single(),
      supabase
        .from('leads')
        .select('enrichment_status, is_warm')
        .eq('user_id', user.id),
      supabase
        .from('leads')
        .select('id, first_name, last_name, company, title, engagement_score, stage')
        .eq('user_id', user.id)
        .eq('is_warm', true)
        .order('engagement_score', { ascending: false })
        .limit(5),
      supabase
        .from('leads')
        .select('id, first_name, last_name, company, source, created_at, enrichment_status')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10),
    ])

  const totalLeads = stats?.length ?? 0
  const enrichedLeads = stats?.filter(l => l.enrichment_status === 'completed').length ?? 0
  const warmLeadsCount = stats?.filter(l => l.is_warm).length ?? 0

  const { count: messageCount } = await supabase
    .from('outreach_messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  const trialEndsAt = profile?.trial_ends_at ? new Date(profile.trial_ends_at) : null
  const daysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0

  const statCards = [
    { label: 'Total Leads', value: totalLeads, icon: Users, color: '#a0a0b0' },
    { label: 'Enriched', value: enrichedLeads, icon: TrendingUp, color: '#00d4aa' },
    { label: 'Warm Leads', value: warmLeadsCount, icon: Flame, color: '#f97316' },
    { label: 'Messages Generated', value: messageCount ?? 0, icon: MessageSquare, color: '#a78bfa' },
  ]

  return (
    <div className="p-6 md:p-8 pt-20 md:pt-8 max-w-7xl mx-auto">
      {/* Trial banner */}
      {profile?.plan_tier === 'trial' && daysLeft <= 7 && (
        <div
          className="mb-6 px-4 py-3 rounded-lg flex items-center justify-between text-sm"
          style={{
            backgroundColor: 'rgba(249, 115, 22, 0.1)',
            border: '1px solid rgba(249, 115, 22, 0.2)',
            color: '#fb923c',
          }}
        >
          <span>Your free trial ends in {daysLeft} day{daysLeft !== 1 ? 's' : ''}.</span>
          <Link
            href="/dashboard/settings"
            className="font-semibold underline text-white"
          >
            Upgrade now →
          </Link>
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">
          {profile?.company_name
            ? `${profile.company_name}'s Pipeline`
            : 'Your Pipeline'}
        </h1>
        <p style={{ color: '#a0a0b0' }} className="text-sm mt-1">
          Here&apos;s what&apos;s happening with your leads today.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.label}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm" style={{ color: '#a0a0b0' }}>{stat.label}</span>
                  <Icon className="w-4 h-4" style={{ color: stat.color }} />
                </div>
                <div className="text-3xl font-bold text-white">{stat.value}</div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Warm leads */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-400" />
                Warm Leads
              </CardTitle>
              <Link
                href="/dashboard/leads?filter=warm"
                className="text-xs flex items-center gap-1 transition-colors"
                style={{ color: '#00d4aa' }}
              >
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {!warmLeads || warmLeads.length === 0 ? (
              <div className="text-center py-8">
                <Flame className="w-8 h-8 mx-auto mb-3" style={{ color: '#222233' }} />
                <p className="text-sm" style={{ color: '#555566' }}>No warm leads yet</p>
                <p className="text-xs mt-1" style={{ color: '#555566' }}>
                  Import leads and let AI enrich them
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {warmLeads.map((lead) => (
                  <Link
                    key={lead.id}
                    href={`/dashboard/leads/${lead.id}`}
                    className="flex items-center justify-between p-3 rounded-lg transition-colors hover:bg-[#1a1a24]"
                    style={{ border: '1px solid #222233' }}
                  >
                    <div>
                      <p className="text-sm font-medium text-white">
                        {lead.first_name} {lead.last_name}
                      </p>
                      <p className="text-xs" style={{ color: '#a0a0b0' }}>
                        {lead.title ? `${lead.title} · ` : ''}{lead.company}
                      </p>
                    </div>
                    <LeadScoreBadge score={lead.engagement_score ?? 0} />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4" style={{ color: '#a0a0b0' }} />
                Recent Activity
              </CardTitle>
              <Link
                href="/dashboard/leads"
                className="text-xs flex items-center gap-1 transition-colors"
                style={{ color: '#00d4aa' }}
              >
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {!recentLeads || recentLeads.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-8 h-8 mx-auto mb-3" style={{ color: '#222233' }} />
                <p className="text-sm mb-3" style={{ color: '#555566' }}>
                  Import your first leads to get started
                </p>
                <Link
                  href="/dashboard/onboarding"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                  style={{ backgroundColor: '#00d4aa', color: '#0a0a0f' }}
                >
                  Get started <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {recentLeads.map((lead) => (
                  <Link
                    key={lead.id}
                    href={`/dashboard/leads/${lead.id}`}
                    className="flex items-center justify-between p-3 rounded-lg transition-colors hover:bg-[#1a1a24]"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ backgroundColor: '#1a1a24', color: '#00d4aa' }}
                      >
                        {(lead.first_name?.[0] ?? '?').toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">
                          {lead.first_name} {lead.last_name}
                        </p>
                        <p className="text-xs" style={{ color: '#555566' }}>{lead.company}</p>
                      </div>
                    </div>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: lead.enrichment_status === 'completed' ? 'rgba(0,212,170,0.1)' : '#1a1a24',
                        color: lead.enrichment_status === 'completed' ? '#00d4aa' : '#555566',
                      }}
                    >
                      {lead.source}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
