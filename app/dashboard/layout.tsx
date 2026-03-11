import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SidebarNav } from '@/components/dashboard/SidebarNav'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('users')
    .select('email, name, company_name, onboarding_completed, onboarding_step')
    .eq('id', user.id)
    .single()

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#0a0a0f' }}>
      <SidebarNav
        userEmail={profile?.email ?? user.email ?? ''}
        userName={profile?.name ?? null}
        onboardingCompleted={profile?.onboarding_completed ?? false}
      />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
