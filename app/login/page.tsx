'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    setLoading(false)

    if (authError) {
      setError(authError.message)
    } else {
      setSent(true)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: '#0a0a0f' }}
    >
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <span className="text-3xl font-bold text-white">
            Pipe
          </span>
          <span className="text-3xl font-bold" style={{ color: '#00d4aa' }}>
            loop.ai
          </span>
        </div>

        {/* Card */}
        <div
          className="rounded-xl p-8 border"
          style={{
            backgroundColor: '#111118',
            borderColor: '#222233',
          }}
        >
          {sent ? (
            /* Success State */
            <div className="text-center">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ backgroundColor: 'rgba(0, 212, 170, 0.15)' }}
              >
                <svg
                  className="w-8 h-8"
                  style={{ color: '#00d4aa' }}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Check your email!</h2>
              <p style={{ color: '#a0a0b0' }} className="text-sm leading-relaxed">
                We sent a magic link to{' '}
                <span className="text-white font-medium">{email}</span>.
                <br />
                Click the link to sign in — it expires in 1 hour.
              </p>
              <button
                onClick={() => { setSent(false); setEmail('') }}
                className="mt-6 text-sm underline"
                style={{ color: '#a0a0b0' }}
              >
                Use a different email
              </button>
            </div>
          ) : (
            /* Login Form */
            <>
              <div className="mb-8">
                <h1 className="text-2xl font-bold text-white mb-2">Start your free trial</h1>
                <p style={{ color: '#a0a0b0' }} className="text-sm leading-relaxed">
                  Enter your email. We&apos;ll send you a magic link — no password needed.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium mb-2"
                    style={{ color: '#a0a0b0' }}
                  >
                    Work email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                    className="w-full px-4 py-3 rounded-lg text-white placeholder:text-[#555566] outline-none transition-all focus:ring-2"
                    style={{
                      backgroundColor: '#1a1a24',
                      border: '1px solid #222233',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#00d4aa'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#222233'
                    }}
                  />
                </div>

                {error && (
                  <div
                    className="px-4 py-3 rounded-lg text-sm"
                    style={{
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      color: '#f87171',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                    }}
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !email}
                  className="w-full py-3 px-6 rounded-lg font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{
                    backgroundColor: loading || !email ? '#00d4aa99' : '#00d4aa',
                    color: '#0a0a0f',
                  }}
                  onMouseEnter={(e) => {
                    if (!loading && email) e.currentTarget.style.backgroundColor = '#00eabb'
                  }}
                  onMouseLeave={(e) => {
                    if (!loading && email) e.currentTarget.style.backgroundColor = '#00d4aa'
                  }}
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Sending...
                    </>
                  ) : (
                    'Send Magic Link →'
                  )}
                </button>
              </form>

              <div className="mt-6 pt-6" style={{ borderTop: '1px solid #222233' }}>
                <a
                  href="https://calendly.com/pipeloop"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center text-sm transition-colors"
                  style={{ color: '#555566' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#a0a0b0' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#555566' }}
                >
                  Book a walkthrough instead →
                </a>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs mt-6" style={{ color: '#555566' }}>
          By signing in, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  )
}
