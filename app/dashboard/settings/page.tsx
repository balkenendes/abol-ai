'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Loader2, CheckCircle2, Zap } from 'lucide-react'

interface UserProfile {
  email: string
  name: string | null
  company_name: string | null
  company_website: string | null
  what_you_sell: string | null
  plan_tier: string | null
  trial_ends_at: string | null
}

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: '€49',
    period: '/month',
    leads: 100,
    features: ['100 leads/month', 'AI enrichment', 'Outreach generation', 'Email support'],
    priceEnvKey: 'STRIPE_STARTER_PRICE_ID',
  },
  {
    id: 'growth',
    name: 'Growth',
    price: '€99',
    period: '/month',
    leads: 200,
    features: ['200 leads/month', 'Everything in Starter', 'Priority enrichment', 'Slack support'],
    popular: true,
    priceEnvKey: 'STRIPE_GROWTH_PRICE_ID',
  },
  {
    id: 'scale',
    name: 'Scale',
    price: '€199',
    period: '/month',
    leads: 400,
    features: ['400 leads/month', 'Everything in Growth', 'Custom ICP scoring', 'Dedicated support'],
    priceEnvKey: 'STRIPE_SCALE_PRICE_ID',
  },
]

type ActiveTab = 'account' | 'billing'

export default function SettingsPage() {
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState<ActiveTab>('account')
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [name, setName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [companyWebsite, setCompanyWebsite] = useState('')
  const [whatYouSell, setWhatYouSell] = useState('')

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('users')
        .select('email, name, company_name, company_website, what_you_sell, plan_tier, trial_ends_at')
        .eq('id', user.id)
        .single()

      if (data) {
        setProfile(data as UserProfile)
        setName(data.name ?? '')
        setCompanyName(data.company_name ?? '')
        setCompanyWebsite(data.company_website ?? '')
        setWhatYouSell(data.what_you_sell ?? '')
      }
      setLoading(false)
    }
    void loadProfile()
  }, [supabase])

  async function saveAccount() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('users').update({
      name,
      company_name: companyName,
      company_website: companyWebsite,
      what_you_sell: whatYouSell,
    }).eq('id', user.id)

    setProfile(prev => prev ? { ...prev, name, company_name: companyName, company_website: companyWebsite, what_you_sell: whatYouSell } : null)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  async function handleUpgrade(planId: string) {
    const res = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId }),
    })
    const data = await res.json() as { url?: string }
    if (data.url) window.location.href = data.url
  }

  const trialEndsAt = profile?.trial_ends_at ? new Date(profile.trial_ends_at) : null
  const daysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0

  if (loading) {
    return (
      <div className="p-8 pt-20 md:pt-8 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#00d4aa' }} />
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 pt-20 md:pt-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Settings</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg w-fit" style={{ backgroundColor: '#1a1a24' }}>
        {(['account', 'billing'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-4 py-2 rounded-md text-sm font-medium transition-colors capitalize"
            style={{
              backgroundColor: activeTab === tab ? '#111118' : 'transparent',
              color: activeTab === tab ? 'white' : '#a0a0b0',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Account tab */}
      {activeTab === 'account' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>Update your profile and company details.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: '#a0a0b0' }}>
                  Email
                </label>
                <Input
                  value={profile?.email ?? ''}
                  disabled
                  className="opacity-50"
                />
                <p className="text-xs mt-1" style={{ color: '#555566' }}>
                  Email cannot be changed. Contact support if needed.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: '#a0a0b0' }}>
                  Your name
                </label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="John Smith"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: '#a0a0b0' }}>
                  Company name
                </label>
                <Input
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder="Acme Corp"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: '#a0a0b0' }}>
                  Company website
                </label>
                <Input
                  value={companyWebsite}
                  onChange={e => setCompanyWebsite(e.target.value)}
                  placeholder="https://acme.com"
                  type="url"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: '#a0a0b0' }}>
                  What do you sell?
                </label>
                <textarea
                  value={whatYouSell}
                  onChange={e => setWhatYouSell(e.target.value)}
                  placeholder="Describe your product or service..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder:text-[#555566] outline-none focus:ring-2 focus:ring-[#00d4aa] resize-none"
                  style={{ backgroundColor: '#1a1a24', border: '1px solid #222233' }}
                />
              </div>

              <Button
                onClick={saveAccount}
                disabled={saving}
                className="flex items-center gap-2"
              >
                {saving
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : saved
                    ? <CheckCircle2 className="w-4 h-4" />
                    : null
                }
                {saved ? 'Saved!' : 'Save Changes'}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Billing tab */}
      {activeTab === 'billing' && (
        <div className="space-y-6">
          {/* Current plan */}
          <Card>
            <CardHeader>
              <CardTitle>Current Plan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-semibold text-white capitalize">
                    {profile?.plan_tier ?? 'Trial'}
                  </p>
                  {profile?.plan_tier === 'trial' && (
                    <p className="text-sm mt-0.5" style={{ color: daysLeft <= 3 ? '#f97316' : '#a0a0b0' }}>
                      {daysLeft > 0
                        ? `${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining in your free trial`
                        : 'Your trial has expired'}
                    </p>
                  )}
                </div>
                <span
                  className="px-3 py-1 rounded-full text-xs font-semibold"
                  style={{
                    backgroundColor: profile?.plan_tier === 'trial' ? 'rgba(234,179,8,0.1)' : 'rgba(0,212,170,0.1)',
                    color: profile?.plan_tier === 'trial' ? '#facc15' : '#00d4aa',
                  }}
                >
                  {profile?.plan_tier === 'trial' ? 'Free Trial' : 'Active'}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Upgrade options */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Upgrade your plan</h3>
            <div className="grid gap-4">
              {PLANS.map(plan => {
                const isCurrent = profile?.plan_tier === plan.id
                return (
                  <div
                    key={plan.id}
                    className="rounded-xl p-5 border transition-all relative"
                    style={{
                      backgroundColor: plan.popular ? 'rgba(0,212,170,0.05)' : '#111118',
                      borderColor: plan.popular ? 'rgba(0,212,170,0.3)' : '#222233',
                    }}
                  >
                    {plan.popular && (
                      <span
                        className="absolute -top-2.5 left-4 px-2.5 py-0.5 rounded-full text-xs font-semibold"
                        style={{ backgroundColor: '#00d4aa', color: '#0a0a0f' }}
                      >
                        Most Popular
                      </span>
                    )}
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Zap className="w-4 h-4" style={{ color: plan.popular ? '#00d4aa' : '#a0a0b0' }} />
                          <span className="font-semibold text-white">{plan.name}</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-bold text-white">{plan.price}</span>
                          <span className="text-sm" style={{ color: '#a0a0b0' }}>{plan.period}</span>
                        </div>
                        <ul className="mt-2 space-y-1">
                          {plan.features.map(f => (
                            <li key={f} className="flex items-center gap-2 text-xs" style={{ color: '#a0a0b0' }}>
                              <CheckCircle2 className="w-3 h-3 shrink-0" style={{ color: '#00d4aa' }} />
                              {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="ml-6 shrink-0">
                        {isCurrent ? (
                          <span
                            className="px-4 py-2 rounded-lg text-sm font-medium"
                            style={{ backgroundColor: '#1a1a24', color: '#555566' }}
                          >
                            Current plan
                          </span>
                        ) : (
                          <Button
                            onClick={() => handleUpgrade(plan.id)}
                            variant={plan.popular ? 'default' : 'outline'}
                            size="sm"
                          >
                            Upgrade
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
