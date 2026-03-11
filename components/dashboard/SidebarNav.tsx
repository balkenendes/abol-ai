'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard,
  Users,
  Megaphone,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Zap,
  ClipboardCheck,
  GitBranch,
} from 'lucide-react'

interface SidebarNavProps {
  userEmail: string
  userName: string | null
  onboardingCompleted: boolean
}

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/pipeline', label: 'Pipeline', icon: GitBranch },
  { href: '/dashboard/leads', label: 'Leads', icon: Users },
  { href: '/dashboard/review', label: 'Review Queue', icon: ClipboardCheck },
  { href: '/dashboard/campaigns', label: 'Campaigns', icon: Megaphone, comingSoon: true },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

export function SidebarNav({ userEmail, userName, onboardingCompleted }: SidebarNavProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    setSigningOut(true)
    await supabase.auth.signOut()
    router.push('/login')
  }

  const sidebarWidth = collapsed ? '64px' : '240px'

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex flex-col h-screen border-r transition-all duration-300 shrink-0"
        style={{
          width: sidebarWidth,
          backgroundColor: '#111118',
          borderColor: '#222233',
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center h-16 px-4 border-b shrink-0"
          style={{ borderColor: '#222233' }}
        >
          {collapsed ? (
            <span className="text-xl font-bold mx-auto" style={{ color: '#00d4aa' }}>P</span>
          ) : (
            <Link href="/dashboard" className="flex items-center gap-1">
              <Zap className="w-5 h-5" style={{ color: '#00d4aa' }} />
              <span className="text-lg font-bold text-white">Pipe</span>
              <span className="text-lg font-bold" style={{ color: '#00d4aa' }}>loop.ai</span>
            </Link>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-hidden">
          {!onboardingCompleted && !collapsed && (
            <Link
              href="/dashboard/onboarding"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium mb-4 transition-colors"
              style={{
                backgroundColor: 'rgba(0, 212, 170, 0.1)',
                color: '#00d4aa',
                border: '1px solid rgba(0, 212, 170, 0.2)',
              }}
            >
              <Zap className="w-4 h-4 shrink-0" />
              <span>Complete Setup</span>
            </Link>
          )}

          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))

            return (
              <Link
                key={item.href}
                href={item.comingSoon ? '#' : item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors relative ${
                  item.comingSoon ? 'cursor-default' : ''
                }`}
                style={{
                  backgroundColor: isActive ? 'rgba(0, 212, 170, 0.1)' : 'transparent',
                  color: isActive ? '#00d4aa' : item.comingSoon ? '#555566' : '#a0a0b0',
                }}
                onClick={item.comingSoon ? (e) => e.preventDefault() : undefined}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {!collapsed && (
                  <span className="truncate">
                    {item.label}
                    {item.comingSoon && (
                      <span
                        className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full"
                        style={{
                          backgroundColor: '#1a1a24',
                          color: '#555566',
                          border: '1px solid #222233',
                        }}
                      >
                        Soon
                      </span>
                    )}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Collapse button */}
        <div className="px-2 pb-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center p-2 rounded-lg transition-colors"
            style={{ color: '#555566' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#a0a0b0'; e.currentTarget.style.backgroundColor = '#1a1a24' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#555566'; e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            {!collapsed && <span className="ml-2 text-xs">Collapse</span>}
          </button>
        </div>

        {/* User section */}
        <div
          className="border-t p-3 shrink-0"
          style={{ borderColor: '#222233' }}
        >
          {collapsed ? (
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="w-full flex items-center justify-center p-2 rounded-lg transition-colors"
              style={{ color: '#555566' }}
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          ) : (
            <div className="space-y-2">
              <div className="px-2">
                {userName && (
                  <p className="text-xs font-medium text-white truncate">{userName}</p>
                )}
                <p className="text-xs truncate" style={{ color: '#555566' }}>{userEmail}</p>
              </div>
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors"
                style={{ color: '#555566' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#a0a0b0'; e.currentTarget.style.backgroundColor = '#1a1a24' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#555566'; e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                <LogOut className="w-3.5 h-3.5" />
                {signingOut ? 'Signing out...' : 'Sign out'}
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile header */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between h-14 px-4 border-b"
        style={{ backgroundColor: '#111118', borderColor: '#222233' }}
      >
        <Link href="/dashboard" className="flex items-center gap-1">
          <Zap className="w-5 h-5" style={{ color: '#00d4aa' }} />
          <span className="text-lg font-bold text-white">Pipe</span>
          <span className="text-lg font-bold" style={{ color: '#00d4aa' }}>loop.ai</span>
        </Link>
        <nav className="flex items-center gap-1">
          {navItems.filter(i => !i.comingSoon).map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className="p-2 rounded-lg"
                style={{ color: isActive ? '#00d4aa' : '#555566' }}
              >
                <Icon className="w-5 h-5" />
              </Link>
            )
          })}
        </nav>
      </div>
    </>
  )
}
