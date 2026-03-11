import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LeadScoreBadge } from '@/components/dashboard/LeadScoreBadge'
import { EnrichmentStatus } from '@/components/dashboard/EnrichmentStatus'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Users, Plus, Search, ExternalLink, ArrowRight } from 'lucide-react'

const PAGE_SIZE = 50

const STAGE_LABELS: Record<string, string> = {
  new: 'New',
  enriched: 'Enriched',
  contacted: 'Contacted',
  connected: 'Connected',
  engaged: 'Engaged',
  warm: 'Warm',
  meeting_booked: 'Meeting Booked',
  closed_won: 'Won',
  closed_lost: 'Lost',
  expired: 'Expired',
}

type StageName = keyof typeof STAGE_LABELS

function stageBadgeVariant(stage: string): 'new' | 'enriched' | 'contacted' | 'warm' | 'secondary' {
  if (stage === 'new') return 'new'
  if (stage === 'enriched') return 'enriched'
  if (stage === 'contacted' || stage === 'connected') return 'contacted'
  if (stage === 'warm' || stage === 'meeting_booked') return 'warm'
  return 'secondary'
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: { search?: string; stage?: string; status?: string; page?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const search = searchParams.search ?? ''
  const stageFilter = searchParams.stage ?? ''
  const statusFilter = searchParams.status ?? ''
  const page = parseInt(searchParams.page ?? '1', 10)
  const offset = (page - 1) * PAGE_SIZE

  let query = supabase
    .from('leads')
    .select('id, first_name, last_name, company, title, stage, engagement_score, enrichment_status, linkedin_url, created_at', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (stageFilter) query = query.eq('stage', stageFilter)
  if (statusFilter) query = query.eq('enrichment_status', statusFilter)
  if (search) {
    query = query.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,company.ilike.%${search}%`
    )
  }

  const { data: leads, count } = await query
  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE)

  return (
    <div className="p-6 md:p-8 pt-20 md:pt-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Leads</h1>
          <p className="text-sm mt-0.5" style={{ color: '#a0a0b0' }}>
            {count ?? 0} total leads
          </p>
        </div>
        <Link href="/dashboard/onboarding">
          <Button className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Import Leads
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        {/* Search */}
        <form className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#555566' }} />
          <input
            name="search"
            defaultValue={search}
            placeholder="Search leads..."
            className="pl-9 pr-4 py-2 rounded-lg text-sm outline-none focus:ring-2"
            style={{
              backgroundColor: '#1a1a24',
              border: '1px solid #222233',
              color: 'white',
              width: '220px',
            }}
          />
          {/* hidden fields to preserve other filters */}
          {stageFilter && <input type="hidden" name="stage" value={stageFilter} />}
          {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
        </form>

        {/* Stage filter */}
        <div className="flex items-center gap-2 flex-wrap">
          {['', 'new', 'enriched', 'contacted', 'warm', 'meeting_booked'].map(s => (
            <Link
              key={s}
              href={`/dashboard/leads?${new URLSearchParams({ ...(search && { search }), ...(s && { stage: s }), ...(statusFilter && { status: statusFilter }) }).toString()}`}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
              style={{
                backgroundColor: stageFilter === s ? 'rgba(0,212,170,0.2)' : '#1a1a24',
                color: stageFilter === s ? '#00d4aa' : '#a0a0b0',
                border: stageFilter === s ? '1px solid rgba(0,212,170,0.4)' : '1px solid #222233',
              }}
            >
              {s === '' ? 'All' : STAGE_LABELS[s as StageName] ?? s}
            </Link>
          ))}
        </div>
      </div>

      {/* Table */}
      {!leads || leads.length === 0 ? (
        <div className="text-center py-20">
          <Users className="w-12 h-12 mx-auto mb-4" style={{ color: '#222233' }} />
          <p className="text-lg font-medium text-white mb-2">No leads yet</p>
          <p className="text-sm mb-6" style={{ color: '#555566' }}>
            Import your first leads to get started
          </p>
          <Link href="/dashboard/onboarding">
            <Button className="inline-flex items-center gap-2">
              Import Leads <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      ) : (
        <>
          <div
            className="rounded-xl overflow-hidden border"
            style={{ borderColor: '#222233' }}
          >
            <table className="w-full">
              <thead style={{ backgroundColor: '#111118' }}>
                <tr>
                  {['Name', 'Company', 'Title', 'Stage', 'Score', 'Status', 'Actions'].map(h => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide"
                      style={{ color: '#555566', borderBottom: '1px solid #222233' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.map((lead, idx) => (
                  <tr
                    key={lead.id}
                    style={{
                      borderTop: idx > 0 ? '1px solid #222233' : 'none',
                    }}
                    className="hover:bg-[#1a1a24] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/leads/${lead.id}`} className="block">
                        <p className="text-sm font-medium text-white">
                          {lead.first_name} {lead.last_name}
                        </p>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm" style={{ color: '#a0a0b0' }}>{lead.company}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm" style={{ color: '#555566' }}>{lead.title ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={stageBadgeVariant(lead.stage ?? 'new')}>
                        {STAGE_LABELS[lead.stage ?? 'new'] ?? lead.stage}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <LeadScoreBadge score={lead.engagement_score ?? 0} />
                    </td>
                    <td className="px-4 py-3">
                      <EnrichmentStatus
                        status={(lead.enrichment_status as 'pending' | 'processing' | 'completed' | 'failed') ?? 'pending'}
                        leadId={lead.id}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/dashboard/leads/${lead.id}`}
                          className="text-xs px-2 py-1 rounded-md transition-colors"
                          style={{
                            backgroundColor: '#1a1a24',
                            color: '#a0a0b0',
                            border: '1px solid #222233',
                          }}
                        >
                          View
                        </Link>
                        {lead.linkedin_url && (
                          <a
                            href={lead.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs p-1 rounded-md transition-colors"
                            style={{ color: '#555566' }}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm" style={{ color: '#555566' }}>
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={`/dashboard/leads?${new URLSearchParams({ ...(search && { search }), ...(stageFilter && { stage: stageFilter }), page: String(page - 1) }).toString()}`}
                  >
                    <Button variant="outline" size="sm">Previous</Button>
                  </Link>
                )}
                {page < totalPages && (
                  <Link
                    href={`/dashboard/leads?${new URLSearchParams({ ...(search && { search }), ...(stageFilter && { stage: stageFilter }), page: String(page + 1) }).toString()}`}
                  >
                    <Button variant="outline" size="sm">Next</Button>
                  </Link>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
