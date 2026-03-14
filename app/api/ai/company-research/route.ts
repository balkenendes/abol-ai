import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { company } = await req.json()

    const prompt = `You are a B2B sales intelligence AI. Based on your knowledge of "${company}", generate a realistic sales context. If you don't know this specific company, infer from the name and generate something realistic.

Return ONLY a JSON object, no markdown, no explanation:
{
  "website": "best guess at their website domain",
  "icp": "their ideal client persona in 1-2 sentences — specific job title, company size, industry, geography",
  "pain": "the #1 problem their clients have that they solve — specific, emotional, real",
  "solution": "what ${company} offers and approximately what it costs — be specific",
  "tagline": "a compelling one-liner for what ${company} does"
}

Be specific and confident. If uncertain, make realistic assumptions based on the company name.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonStart = text.indexOf('{')
    const jsonEnd = text.lastIndexOf('}') + 1
    const data = JSON.parse(text.slice(jsonStart, jsonEnd))
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({
      website: '', icp: '', pain: '', solution: '', tagline: '',
    })
  }
}
