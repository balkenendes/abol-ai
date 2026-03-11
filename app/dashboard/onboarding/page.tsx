'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Papa from 'papaparse'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowRight, Upload, CheckCircle2, Loader2 } from 'lucide-react'

interface CsvRow {
  first_name?: string
  last_name?: string
  company?: string
  email?: string
  title?: string
  linkedin_url?: string
  website?: string
  [key: string]: string | undefined
}

interface ParsedLead {
  first_name: string
  last_name: string
  company: string
  email?: string
  title?: string
  linkedin_url?: string
  website?: string
}

const STEPS = ['Company', 'ICP', 'Import Leads', 'Launch']

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()

  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [importTab, setImportTab] = useState<'csv' | 'linkedin'>('csv')

  // Step 1
  const [companyName, setCompanyName] = useState('')
  const [companyWebsite, setCompanyWebsite] = useState('')
  const [whatYouSell, setWhatYouSell] = useState('')

  // Step 2
  const [targetTitle, setTargetTitle] = useState('')
  const [targetIndustry, setTargetIndustry] = useState('')
  const [targetCompanySize, setTargetCompanySize] = useState('')
  const [targetCountry, setTargetCountry] = useState('Netherlands')

  // Step 3 CSV
  const [csvLeads, setCsvLeads] = useState<ParsedLead[]>([])
  const [csvError, setCsvError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  // Step 3 LinkedIn
  const [linkedinUrls, setLinkedinUrls] = useState('')

  // Step 4
  const [importResult, setImportResult] = useState<{ imported: number; duplicates_skipped: number } | null>(null)

  async function saveStep1() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      await supabase.from('users').update({
        company_name: companyName,
        company_website: companyWebsite,
        what_you_sell: whatYouSell,
        onboarding_step: 2,
      }).eq('id', user.id)

      setCurrentStep(2)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function saveStep2() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: existing } = await supabase
        .from('user_icp')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (existing) {
        await supabase.from('user_icp').update({
          target_title: targetTitle,
          target_industry: targetIndustry,
          target_company_size: targetCompanySize,
          target_country: targetCountry,
        }).eq('user_id', user.id)
      } else {
        await supabase.from('user_icp').insert({
          user_id: user.id,
          target_title: targetTitle,
          target_industry: targetIndustry,
          target_company_size: targetCompanySize,
          target_country: targetCountry,
        })
      }

      await supabase.from('users').update({ onboarding_step: 3 }).eq('id', user.id)
      setCurrentStep(3)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  function parseCsvFile(file: File) {
    setCsvError(null)
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data
        if (!rows.length) {
          setCsvError('CSV file is empty.')
          return
        }

        const firstRow = rows[0]
        if (!firstRow['first_name'] || !firstRow['last_name'] || !firstRow['company']) {
          setCsvError('CSV must have columns: first_name, last_name, company')
          return
        }

        const parsed: ParsedLead[] = rows
          .filter(r => r.first_name && r.last_name && r.company)
          .map(r => ({
            first_name: r.first_name!,
            last_name: r.last_name!,
            company: r.company!,
            email: r.email || undefined,
            title: r.title || undefined,
            linkedin_url: r.linkedin_url || undefined,
            website: r.website || undefined,
          }))

        setCsvLeads(parsed)
      },
      error: (err: Error) => {
        setCsvError(err.message)
      },
    })
  }

  const handleFileDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) parseCsvFile(file)
  }, [])

  async function importCsvLeads() {
    if (!csvLeads.length) return
    setLoading(true)
    try {
      const res = await fetch('/api/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: csvLeads }),
      })
      const data = await res.json() as { imported: number; duplicates_skipped: number }
      setImportResult(data)
      setCurrentStep(4)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function importLinkedinUrls() {
    const urls = linkedinUrls
      .split('\n')
      .map(u => u.trim())
      .filter(u => u.startsWith('http'))

    if (!urls.length) return
    setLoading(true)
    try {
      const leads = urls.map(url => {
        const parts = url.split('/in/').pop()?.split('/')[0] ?? 'unknown'
        return {
          first_name: parts,
          last_name: '',
          company: 'Unknown',
          linkedin_url: url,
        }
      })
      const res = await fetch('/api/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads }),
      })
      const data = await res.json() as { imported: number; duplicates_skipped: number }
      setImportResult(data)
      setCurrentStep(4)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function finishOnboarding() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('users').update({
        onboarding_completed: true,
        onboarding_step: 4,
      }).eq('id', user.id)
    }
    router.push('/dashboard')
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12 pt-20 md:pt-12"
      style={{ backgroundColor: '#0a0a0f' }}
    >
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            {STEPS.map((step, idx) => {
              const stepNum = idx + 1
              const isDone = currentStep > stepNum
              const isActive = currentStep === stepNum
              return (
                <div key={step} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                      style={{
                        backgroundColor: isDone ? '#00d4aa' : isActive ? 'rgba(0,212,170,0.2)' : '#1a1a24',
                        color: isDone ? '#0a0a0f' : isActive ? '#00d4aa' : '#555566',
                        border: isActive ? '2px solid #00d4aa' : isDone ? 'none' : '2px solid #222233',
                      }}
                    >
                      {isDone ? <CheckCircle2 className="w-4 h-4" /> : stepNum}
                    </div>
                    <span
                      className="text-xs mt-1 hidden sm:block"
                      style={{ color: isActive ? '#00d4aa' : '#555566' }}
                    >
                      {step}
                    </span>
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div
                      className="flex-1 h-px mx-2 mt-[-12px]"
                      style={{
                        backgroundColor: currentStep > stepNum ? '#00d4aa' : '#222233',
                        width: '60px',
                      }}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Step content */}
        <div
          className="rounded-xl p-8 border"
          style={{ backgroundColor: '#111118', borderColor: '#222233' }}
        >
          {/* Step 1: Company info */}
          {currentStep === 1 && (
            <div>
              <h2 className="text-xl font-bold text-white mb-1">Tell us about your company</h2>
              <p className="text-sm mb-6" style={{ color: '#a0a0b0' }}>
                This helps AI personalize outreach on your behalf.
              </p>
              <div className="space-y-4">
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
                  <Textarea
                    value={whatYouSell}
                    onChange={e => setWhatYouSell(e.target.value)}
                    placeholder="We help B2B SaaS companies automate their outbound sales with AI-powered lead enrichment and personalized messaging..."
                    rows={4}
                  />
                </div>
                <Button
                  onClick={saveStep1}
                  disabled={loading || !companyName || !companyWebsite || whatYouSell.length < 10}
                  className="w-full"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Next →
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: ICP */}
          {currentStep === 2 && (
            <div>
              <h2 className="text-xl font-bold text-white mb-1">Define your ideal customer</h2>
              <p className="text-sm mb-6" style={{ color: '#a0a0b0' }}>
                AI uses this to score and prioritize your leads.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: '#a0a0b0' }}>
                    Target job title(s)
                  </label>
                  <Input
                    value={targetTitle}
                    onChange={e => setTargetTitle(e.target.value)}
                    placeholder="CEO, Founder, VP Sales"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: '#a0a0b0' }}>
                    Target industry
                  </label>
                  <Input
                    value={targetIndustry}
                    onChange={e => setTargetIndustry(e.target.value)}
                    placeholder="B2B SaaS, FinTech, eCommerce"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: '#a0a0b0' }}>
                    Target company size
                  </label>
                  <Select value={targetCompanySize} onValueChange={setTargetCompanySize}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select size range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1-10">1–10 employees</SelectItem>
                      <SelectItem value="11-50">11–50 employees</SelectItem>
                      <SelectItem value="51-200">51–200 employees</SelectItem>
                      <SelectItem value="201-500">201–500 employees</SelectItem>
                      <SelectItem value="500+">500+ employees</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: '#a0a0b0' }}>
                    Target country
                  </label>
                  <Input
                    value={targetCountry}
                    onChange={e => setTargetCountry(e.target.value)}
                    placeholder="Netherlands"
                  />
                </div>
                <Button
                  onClick={saveStep2}
                  disabled={loading || !targetTitle || !targetIndustry || !targetCompanySize || !targetCountry}
                  className="w-full"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Next →
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Import */}
          {currentStep === 3 && (
            <div>
              <h2 className="text-xl font-bold text-white mb-1">Import your leads</h2>
              <p className="text-sm mb-6" style={{ color: '#a0a0b0' }}>
                Upload a CSV or paste LinkedIn profile URLs.
              </p>

              {/* Tabs */}
              <div
                className="flex rounded-lg p-1 mb-6"
                style={{ backgroundColor: '#1a1a24' }}
              >
                {(['csv', 'linkedin'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setImportTab(tab)}
                    className="flex-1 py-2 rounded-md text-sm font-medium transition-colors"
                    style={{
                      backgroundColor: importTab === tab ? '#111118' : 'transparent',
                      color: importTab === tab ? '#ffffff' : '#555566',
                    }}
                  >
                    {tab === 'csv' ? 'CSV Upload' : 'LinkedIn URLs'}
                  </button>
                ))}
              </div>

              {importTab === 'csv' ? (
                <div className="space-y-4">
                  {/* Drop zone */}
                  <div
                    className="border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer"
                    style={{
                      borderColor: dragging ? '#00d4aa' : '#222233',
                      backgroundColor: dragging ? 'rgba(0,212,170,0.05)' : 'transparent',
                    }}
                    onDragOver={e => { e.preventDefault(); setDragging(true) }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={handleFileDrop}
                    onClick={() => document.getElementById('csv-input')?.click()}
                  >
                    <Upload className="w-8 h-8 mx-auto mb-3" style={{ color: '#555566' }} />
                    <p className="text-sm font-medium text-white">
                      Drop your CSV here or click to browse
                    </p>
                    <p className="text-xs mt-1" style={{ color: '#555566' }}>
                      Required: first_name, last_name, company
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: '#555566' }}>
                      Optional: email, title, linkedin_url, website
                    </p>
                    <input
                      id="csv-input"
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={e => e.target.files?.[0] && parseCsvFile(e.target.files[0])}
                    />
                  </div>

                  {csvError && (
                    <p className="text-sm text-red-400">{csvError}</p>
                  )}

                  {csvLeads.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-white mb-2">
                        Preview ({csvLeads.length} leads found)
                      </p>
                      <div
                        className="rounded-lg overflow-hidden border"
                        style={{ borderColor: '#222233' }}
                      >
                        <table className="w-full text-xs">
                          <thead style={{ backgroundColor: '#1a1a24' }}>
                            <tr>
                              {['Name', 'Company', 'Title'].map(h => (
                                <th key={h} className="text-left px-3 py-2" style={{ color: '#a0a0b0' }}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {csvLeads.slice(0, 5).map((lead, i) => (
                              <tr
                                key={i}
                                style={{ borderTop: '1px solid #222233' }}
                              >
                                <td className="px-3 py-2 text-white">
                                  {lead.first_name} {lead.last_name}
                                </td>
                                <td className="px-3 py-2" style={{ color: '#a0a0b0' }}>
                                  {lead.company}
                                </td>
                                <td className="px-3 py-2" style={{ color: '#555566' }}>
                                  {lead.title ?? '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {csvLeads.length > 5 && (
                          <p className="text-xs px-3 py-2" style={{ color: '#555566', borderTop: '1px solid #222233' }}>
                            +{csvLeads.length - 5} more rows
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <Button
                    onClick={importCsvLeads}
                    disabled={loading || csvLeads.length === 0}
                    className="w-full"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Import {csvLeads.length > 0 ? `${csvLeads.length} leads` : 'leads'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: '#a0a0b0' }}>
                      LinkedIn profile URLs (one per line)
                    </label>
                    <Textarea
                      value={linkedinUrls}
                      onChange={e => setLinkedinUrls(e.target.value)}
                      placeholder="https://linkedin.com/in/john-doe&#10;https://linkedin.com/in/jane-smith"
                      rows={6}
                    />
                    <p className="text-xs mt-1" style={{ color: '#555566' }}>
                      {linkedinUrls.split('\n').filter(u => u.trim().startsWith('http')).length} URLs detected
                    </p>
                  </div>

                  <Button
                    onClick={importLinkedinUrls}
                    disabled={loading || linkedinUrls.split('\n').filter(u => u.trim().startsWith('http')).length === 0}
                    className="w-full"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Import {linkedinUrls.split('\n').filter(u => u.trim().startsWith('http')).length} URLs
                  </Button>
                </div>
              )}

              <button
                onClick={() => setCurrentStep(4)}
                className="w-full mt-3 text-sm transition-colors"
                style={{ color: '#555566' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#a0a0b0' }}
                onMouseLeave={e => { e.currentTarget.style.color = '#555566' }}
              >
                Skip for now →
              </button>
            </div>
          )}

          {/* Step 4: Launch */}
          {currentStep === 4 && (
            <div className="text-center">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ backgroundColor: 'rgba(0,212,170,0.15)' }}
              >
                <CheckCircle2 className="w-8 h-8" style={{ color: '#00d4aa' }} />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">You&apos;re all set!</h2>

              {importResult ? (
                <div className="mb-4">
                  <p style={{ color: '#a0a0b0' }} className="text-sm">
                    Imported <span className="text-white font-semibold">{importResult.imported} leads</span>
                    {importResult.duplicates_skipped > 0 && (
                      <span> · {importResult.duplicates_skipped} duplicates skipped</span>
                    )}
                  </p>
                </div>
              ) : null}

              <div
                className="rounded-lg p-4 mb-6 text-left"
                style={{ backgroundColor: '#1a1a24', border: '1px solid #222233' }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#00d4aa' }} />
                  <p className="text-sm font-medium text-white">AI enrichment in progress</p>
                </div>
                <p className="text-xs pl-4" style={{ color: '#a0a0b0' }}>
                  We&apos;re researching each lead, building their profile, and generating personalized outreach messages.
                  This runs in the background — check back in a few minutes.
                </p>
              </div>

              <Button onClick={finishOnboarding} className="w-full" size="lg">
                Go to Dashboard <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
