import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { company, website, icp, pain_ambition, solution_fit, solution_pricing } = body

    const prompt = `You are Pipeloop's AI strategy engine. A company has just onboarded and you need to generate a complete, personalized outbound sales strategy.

Company: ${company}
Website: ${website || 'not provided'}
Ideal Client Profile: ${icp}
Client ambition & what's holding them back: ${pain_ambition}
Solution that fits: ${solution_fit}
Their solution & pricing: ${solution_pricing}

Generate a complete outbound sales strategy package. Return ONLY valid JSON, no markdown, no explanation, exactly this structure:

{
  "summary": "2-3 sentence strategic summary of this company's sales opportunity. Be specific, use their company name and ICP.",
  "sales_process": [
    { "step": 1, "label": "...", "description": "...", "timeline": "Day 1-3", "channel": "LinkedIn" },
    { "step": 2, "label": "...", "description": "...", "timeline": "Day 4-7", "channel": "Email" },
    { "step": 3, "label": "...", "description": "...", "timeline": "Day 8-14", "channel": "Landing Page" },
    { "step": 4, "label": "...", "description": "...", "timeline": "Day 15-21", "channel": "Follow-up" },
    { "step": 5, "label": "...", "description": "...", "timeline": "Day 22-30", "channel": "Meeting" }
  ],
  "linkedin_connections": [
    { "name": "Full Name", "title": "Job Title", "company": "Company Name BV/GmbH/Ltd", "location": "City, Country", "why": "One sentence on why this person is a perfect ICP fit", "signal": "Recent activity or trigger that makes them warm" },
    { "name": "...", "title": "...", "company": "...", "location": "...", "why": "...", "signal": "..." },
    { "name": "...", "title": "...", "company": "...", "location": "...", "why": "...", "signal": "..." },
    { "name": "...", "title": "...", "company": "...", "location": "...", "why": "...", "signal": "..." },
    { "name": "...", "title": "...", "company": "...", "location": "...", "why": "...", "signal": "..." },
    { "name": "...", "title": "...", "company": "...", "location": "...", "why": "...", "signal": "..." }
  ],
  "landing_page": {
    "headline": "Compelling, specific headline for the landing page targeting the ICP",
    "subheadline": "Supporting line that addresses the core pain",
    "sections": ["Section 1: The Problem", "Section 2: The Solution", "Section 3: Results/ROI", "Section 4: How it works", "Section 5: CTA"],
    "cta": "Primary CTA button text"
  },
  "whitepaper_titles": [
    "First whitepaper title — specific, data-driven, addresses the ICP pain",
    "Second whitepaper title — tactical, how-to format",
    "Third whitepaper title — thought leadership / future-of angle"
  ],
  "newsletter": {
    "subject": "Email subject line for the first welcome newsletter",
    "preview": "2-3 sentence preview of what the first newsletter would contain. Make it valuable and specific."
  },
  "reddit_groups": [
    { "name": "r/subreddit_name", "members": "estimated member count like 45K", "why": "Why this subreddit is relevant to the ICP" },
    { "name": "r/subreddit_name", "members": "...", "why": "..." },
    { "name": "r/subreddit_name", "members": "...", "why": "..." },
    { "name": "r/subreddit_name", "members": "...", "why": "..." }
  ]
}

Rules:
- LinkedIn profiles: use realistic but fictional names. European mix (Dutch, German, French, Scandinavian, British). Real-sounding companies.
- Sales process: tailor each step to the ICP and their pain point specifically
- Whitepaper titles: make them feel authoritative and worth downloading
- Reddit groups: real subreddits that exist and are relevant
- Everything must feel personally crafted for ${company}, not generic`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonStart = text.indexOf('{')
    const jsonEnd = text.lastIndexOf('}') + 1
    const jsonStr = text.slice(jsonStart, jsonEnd)
    const data = JSON.parse(jsonStr)

    return NextResponse.json(data)
  } catch (err) {
    console.error('demo-generate error:', err)
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }
}
