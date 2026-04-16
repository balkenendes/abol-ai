import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const hostname = request.nextUrl.hostname

  // ── ABOL.ai — serve the AI & Quantum Security Index ──
  if (hostname.includes('abol')) {
    // abol.ai (any path) → serve abol.html
    return NextResponse.rewrite(new URL('/abol.html', request.url))
  }

  // ── /abol path on pipeloop.ai — fallback route until domain is live ──
  if (request.nextUrl.pathname === '/abol' || request.nextUrl.pathname === '/abol/') {
    return NextResponse.rewrite(new URL('/abol.html', request.url))
  }

  // ── Root → serve readiness assessment as homepage (pipeloop.ai) ──
  if (request.nextUrl.pathname === '/') {
    return NextResponse.rewrite(new URL('/readiness.html', request.url))
  }

  // ── Demo bypass: cookie "pipeloop_demo" lets you skip auth entirely ──
  const demoCookie = request.cookies.get('pipeloop_demo')?.value
  if (demoCookie === process.env.WEBHOOK_SECRET) {
    // Demo mode — allow dashboard access without Supabase session
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && request.nextUrl.pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/', '/abol', '/abol/', '/dashboard/:path*', '/login'],
}
