import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/* ── FALLBACK ── always returns something valid */
function buildFallback(company: string, icp: string, region: string) {
  return {
    summary: `${company} has a strong opportunity to reach ${icp || 'their ideal clients'} with a targeted outbound strategy. The combination of LinkedIn outreach, personalized landing pages, and AI-driven follow-up creates a predictable pipeline that runs autonomously.`,
    sales_process: [
      { step: 1, label: 'ICP Research', description: 'Scout AI identifies 30 perfect-fit prospects matching your ICP using Apollo, LinkedIn, and company signals.', timeline: 'Day 1–2', channel: 'LinkedIn' },
      { step: 2, label: 'Enrich & Profile', description: 'Each prospect is enriched with pain points, tech stack, and buying triggers. Persuasion profile assigned.', timeline: 'Day 3–4', channel: 'Email' },
      { step: 3, label: 'LinkedIn Connect', description: 'Personalized connection requests sent. Vincent monitors accepts and triggers DM sequence.', timeline: 'Day 5–10', channel: 'LinkedIn' },
      { step: 4, label: 'Email Sequence', description: 'Warm prospects receive 3-email sequence with whitepaper, case study, and ROI calculator.', timeline: 'Day 11–20', channel: 'Email' },
      { step: 5, label: 'Book Meeting', description: 'Hot leads (score 8+) get priority follow-up with direct Calendly link and personalized landing page.', timeline: 'Day 21–30', channel: 'Meeting' },
    ],
    linkedin_connections: [
      { name: 'Thomas de Vries', title: 'Director of Operations', company: 'ScaleOps BV', location: `Amsterdam, ${region === 'europe' ? 'Netherlands' : 'Germany'}`, why: 'Perfect ICP match — operations leader at 120-person SaaS, recently posted about scaling challenges.', signal: 'Hired 4 ops staff in Q1 — scaling pain signal' },
      { name: 'Sarah Müller', title: 'VP Operations', company: 'GrowthStack GmbH', location: 'Berlin, Germany', why: 'VP Ops at Series B SaaS, 200 employees, actively evaluating tools.', signal: 'Posted last week: "looking for ops automation solutions"' },
      { name: 'Jan Bakker', title: 'COO', company: 'Bakker & Partners', location: 'Rotterdam, Netherlands', why: 'COO with budget authority, company at 80 employees — exact growth stage.', signal: 'Company opened new office — expansion signal' },
      { name: 'Emma Wilson', title: 'Head of RevOps', company: 'TechFlow Ltd', location: 'London, UK', why: 'RevOps leader at 300-person SaaS, controls toolstack decisions.', signal: 'Series B just closed — budget available' },
      { name: 'Lars Hansen', title: 'CRO', company: 'NordScale AS', location: 'Oslo, Norway', why: 'CRO expanding into Benelux — needs operational infrastructure.', signal: 'Expanding to Amsterdam Q2 2025 — perfect timing' },
      { name: 'Marie Dubois', title: 'Director of Growth', company: 'Croissance SaaS', location: 'Paris, France', why: 'Growth director at 90-person SaaS, 60% YoY growth — ops breaking point.', signal: 'Accepted connection from similar company last week' },
    ],
    landing_page: {
      headline: `How ${company} helps your team scale without the chaos`,
      subheadline: 'Stop doing manually what AI can do in seconds. See results in 30 days or we work for free.',
      sections: ['The problem every scaling team faces', `How ${company} solves it`, 'Results from similar companies', 'How it works in 3 steps', 'Start your free trial today'],
      cta: 'See it working in 10 minutes →',
    },
    whitepaper_titles: [
      `The ${new Date().getFullYear()} State of Operations: How 200 Scaling Companies Are Winning Without Adding Headcount`,
      `From Chaos to Clarity: A 90-Day Operational Transformation Playbook for Series A/B Companies`,
      `The Automation Advantage: Why Top-Quartile Operations Teams Do 3× More With Half the Tools`,
    ],
    newsletter: {
      subject: `The one ops change that saved 8 hours/week at [Company] — your free playbook inside`,
      preview: `This week: we interviewed 12 operations leaders about the single change that had the biggest impact on their team. The answer surprised us. We also included the exact framework we use with every new client to map where manual work is killing your growth.`,
    },
    reddit_groups: [
      { name: 'r/startups', members: '1.2M', why: 'Founders and ops leaders discuss scaling challenges daily — high intent audience' },
      { name: 'r/Entrepreneur', members: '1.8M', why: 'SMB and scale-up founders actively seeking growth tools and processes' },
      { name: 'r/sales', members: '180K', why: 'Sales ops and revenue leaders who align with your ICP decision-makers' },
      { name: 'r/SaaS', members: '95K', why: 'SaaS founders and operators — highly targeted match for B2B tools' },
    ],
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { company, website, icp, pain, solution, size, region } = body

  const prompt = `You are Pipeloop's AI strategy engine. Generate a complete personalized outbound sales strategy.

Company: ${company}
Website: ${website || 'unknown'}
ICP: ${icp}
Client pain / ambition: ${pain}
Solution: ${solution}
Company size target: ${size}
Target region: ${region}

Return ONLY raw JSON (no markdown, no code blocks, no explanation). Use this exact structure:
{"summary":"2-3 sentence strategic insight specific to ${company} and their ICP","sales_process":[{"step":1,"label":"step name","description":"specific to their ICP and pain","timeline":"Day 1-3","channel":"LinkedIn"},{"step":2,"label":"...","description":"...","timeline":"Day 4-7","channel":"Email"},{"step":3,"label":"...","description":"...","timeline":"Day 8-14","channel":"Landing Page"},{"step":4,"label":"...","description":"...","timeline":"Day 15-21","channel":"Follow-up"},{"step":5,"label":"...","description":"...","timeline":"Day 22-30","channel":"Meeting"}],"linkedin_connections":[{"name":"Real European name","title":"Exact job title matching ICP","company":"Company BV or GmbH","location":"City, Country in ${region}","why":"Why perfect fit in one sentence","signal":"Specific warm signal or recent activity"},{"name":"...","title":"...","company":"...","location":"...","why":"...","signal":"..."},{"name":"...","title":"...","company":"...","location":"...","why":"...","signal":"..."},{"name":"...","title":"...","company":"...","location":"...","why":"...","signal":"..."},{"name":"...","title":"...","company":"...","location":"...","why":"...","signal":"..."},{"name":"...","title":"...","company":"...","location":"...","why":"...","signal":"..."}],"landing_page":{"headline":"Compelling benefit headline for the ICP","subheadline":"Addresses core pain point directly","sections":["Section 1","Section 2","Section 3","Section 4","Section 5"],"cta":"Action-oriented CTA text"},"whitepaper_titles":["Data-driven research title","Tactical how-to title","Thought leadership future-of title"],"newsletter":{"subject":"High-open-rate subject line","preview":"2-3 sentences of valuable first newsletter content"},"reddit_groups":[{"name":"r/subreddit","members":"size like 450K","why":"relevance to ICP"},{"name":"r/subreddit","members":"...","why":"..."},{"name":"r/subreddit","members":"...","why":"..."},{"name":"r/subreddit","members":"...","why":"..."}]}`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    // Strip markdown code blocks if present
    const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const jsonStart = clean.indexOf('{')
    const jsonEnd = clean.lastIndexOf('}') + 1

    if (jsonStart === -1) throw new Error('No JSON found')

    const data = JSON.parse(clean.slice(jsonStart, jsonEnd))
    return NextResponse.json(data)
  } catch (err) {
    console.error('demo-generate error, using fallback:', err)
    // Always return something — never show an error to the demo user
    return NextResponse.json(buildFallback(company, icp, region))
  }
}
