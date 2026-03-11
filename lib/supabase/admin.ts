import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Lazy initialization — only connects when first called, not at import time
let _adminClient: SupabaseClient | null = null

export function getAdminClient(): SupabaseClient {
  if (!_adminClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      throw new Error('Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
    }
    _adminClient = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return _adminClient
}

// Backward-compatible proxy so existing code using `adminClient.from(...)` still works
export const adminClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return getAdminClient()[prop as keyof SupabaseClient]
  },
})
