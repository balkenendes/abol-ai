// Apollo.io People Search API
// Used by Nova agent to find new leads matching the ICP

const APOLLO_BASE = 'https://api.apollo.io/v1'

export interface ApolloSearchParams {
  titles?: string[]
  industries?: string[]
  employeeCount?: string[]  // e.g. ['1,10', '11,50']
  countries?: string[]
  perPage?: number
}

export interface ApolloLead {
  first_name: string
  last_name: string
  email: string | null
  title: string
  company: string
  company_website: string | null
  linkedin_url: string | null
  city: string | null
  country: string | null
}

export async function searchLeads(
  apiKey: string,
  params: ApolloSearchParams
): Promise<ApolloLead[]> {
  if (!apiKey) {
    console.warn('[Apollo] No API key — returning empty results')
    return []
  }

  try {
    const body: Record<string, unknown> = {
      api_key: apiKey,
      per_page: params.perPage ?? 10,
      page: 1,
    }

    if (params.titles?.length) body['person_titles'] = params.titles
    if (params.industries?.length) body['organization_industry_tag_ids'] = params.industries
    if (params.countries?.length) body['person_locations'] = params.countries
    if (params.employeeCount?.length) body['organization_num_employees_ranges'] = params.employeeCount

    const res = await fetch(`${APOLLO_BASE}/mixed_people/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Apollo error ${res.status}: ${text}`)
    }

    const data = await res.json() as { people?: Array<Record<string, unknown>> }
    const people = data.people ?? []

    return people.map(p => ({
      first_name: String(p['first_name'] ?? ''),
      last_name: String(p['last_name'] ?? ''),
      email: (p['email'] as string | null) ?? null,
      title: String(p['title'] ?? ''),
      company: String((p['organization'] as Record<string, unknown> | null)?.['name'] ?? ''),
      company_website: ((p['organization'] as Record<string, unknown> | null)?.['website_url'] as string | null) ?? null,
      linkedin_url: (p['linkedin_url'] as string | null) ?? null,
      city: (p['city'] as string | null) ?? null,
      country: (p['country'] as string | null) ?? null,
    }))
  } catch (error) {
    console.error('[Apollo] Search failed:', error)
    return []
  }
}

// Map ICP company size to Apollo format
export function sizeToApolloRange(size: string): string[] {
  const map: Record<string, string[]> = {
    '1-10': ['1,10'],
    '11-50': ['11,50'],
    '51-200': ['51,200'],
    '201-500': ['201,500'],
    '500+': ['501,10000'],
  }
  return map[size] ?? ['11,200']
}
