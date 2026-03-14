import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/* Smart fallback so the demo always works even if Claude fails */
function smartFallback(company: string) {
  const slug = company.toLowerCase().replace(/\s+/g, '')
  return {
    website: `${slug}.com`,
    icp: `Sales Directors and VP of Sales at B2B companies with 50–500 employees in Europe, managing a team of 5+ SDRs or AEs who struggle with manual outreach and pipeline visibility.`,
    pain: `Their team spends 60% of time on manual prospecting, CRM updates, and follow-up — leaving less than 2 hours per day for actual selling. Pipeline is unpredictable and leadership has no real-time visibility.`,
    solution: `${company} automates the entire outbound process — from lead finding to personalized outreach — so sales teams close more deals without growing headcount. Starting at €799/month.`,
    tagline: `${company}: The autonomous sales engine that fills your pipeline while you sleep.`,
  }
}

export async function POST(req: NextRequest) {
  const { company } = await req.json()

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `You are a B2B sales intelligence AI. Based on your knowledge of the company "${company}", fill in this JSON. If you don't know the company, make realistic inferences from the name.

Respond with ONLY this JSON, nothing else before or after:
{"website":"their website or best guess like company.com","icp":"their ideal client persona — specific job title, company size, industry, geography in 1-2 sentences","pain":"the #1 problem their clients face that ${company} solves — specific and emotional","solution":"what ${company} offers and estimated pricing","tagline":"a compelling one-liner for what ${company} does"}`,
      }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    // Strip any markdown code fences
    const clean = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    const start = clean.indexOf('{')
    const end = clean.lastIndexOf('}') + 1
    if (start === -1) throw new Error('No JSON in response')

    const data = JSON.parse(clean.slice(start, end))

    // Ensure all keys are present and non-empty
    const fallback = smartFallback(company)
    return NextResponse.json({
      website: data.website || fallback.website,
      icp: data.icp || fallback.icp,
      pain: data.pain || fallback.pain,
      solution: data.solution || fallback.solution,
      tagline: data.tagline || fallback.tagline,
    })
  } catch (err) {
    console.error('company-research error:', err)
    // Always return useful data — never leave the user with empty fields
    return NextResponse.json(smartFallback(company))
  }
}
