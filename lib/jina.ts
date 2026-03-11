// Jina.ai Reader API — converts any webpage to clean markdown
// Better than raw HTML fetch: handles JS-rendered pages, removes nav/footers

const JINA_BASE = 'https://r.jina.ai'

export async function scrapeWebsite(url: string): Promise<string> {
  try {
    const jinaUrl = `${JINA_BASE}/${url}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)

    const res = await fetch(jinaUrl, {
      signal: controller.signal,
      headers: {
        'Accept': 'text/plain',
        'X-Return-Format': 'text',
        ...(process.env.JINA_API_KEY ? { 'Authorization': `Bearer ${process.env.JINA_API_KEY}` } : {}),
      },
    })
    clearTimeout(timeout)

    if (!res.ok) {
      throw new Error(`Jina error: ${res.status}`)
    }

    const text = await res.text()
    // Limit to 5000 chars to stay within Claude context
    return text.slice(0, 5000)
  } catch {
    // Fallback: raw fetch
    return await rawFetchFallback(url)
  }
}

async function rawFetchFallback(url: string): Promise<string> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Pipeloop-Bot/1.0)' },
    })
    clearTimeout(timeout)
    if (!res.ok) return ''
    const html = await res.text()
    return stripHtml(html)
  } catch {
    return ''
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 5000)
}
