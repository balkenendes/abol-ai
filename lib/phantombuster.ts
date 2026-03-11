// PhantomBuster integration for LinkedIn automation (Phase 1)
// Phase 2: replace with HeyReach OAuth

const PHANTOM_API_BASE = 'https://api.phantombuster.com/api/v2'

interface PhantomLaunchResult {
  status: 'success' | 'error'
  containerId?: string
  error?: string
}

interface PhantomStatusResult {
  status: 'running' | 'finished' | 'error' | 'launch-error'
  output?: string
  error?: string
}

async function phantomRequest(path: string, method: string, apiKey: string, body?: unknown) {
  const res = await fetch(`${PHANTOM_API_BASE}${path}`, {
    method,
    headers: {
      'X-Phantombuster-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`PhantomBuster error ${res.status}: ${text}`)
  }
  return res.json() as Promise<Record<string, unknown>>
}

// Send a LinkedIn connection request via PhantomBuster
// Uses the "LinkedIn Auto Connect" phantom
export async function sendLinkedInConnectionRequest(params: {
  apiKey: string
  phantomId: string  // the phantom agent ID from PhantomBuster
  profileUrl: string
  message: string
}): Promise<PhantomLaunchResult> {
  try {
    const result = await phantomRequest('/agents/launch', 'POST', params.apiKey, {
      id: params.phantomId,
      argument: {
        spreadsheetUrl: params.profileUrl,
        message: params.message.slice(0, 300), // LinkedIn hard limit
      },
    })
    return { status: 'success', containerId: result['containerId'] as string }
  } catch (error) {
    return { status: 'error', error: String(error) }
  }
}

// Send a LinkedIn DM via PhantomBuster
// Uses the "LinkedIn Message Sender" phantom
export async function sendLinkedInDM(params: {
  apiKey: string
  phantomId: string
  profileUrl: string
  message: string
}): Promise<PhantomLaunchResult> {
  try {
    const result = await phantomRequest('/agents/launch', 'POST', params.apiKey, {
      id: params.phantomId,
      argument: {
        spreadsheetUrl: params.profileUrl,
        message: params.message,
      },
    })
    return { status: 'success', containerId: result['containerId'] as string }
  } catch (error) {
    return { status: 'error', error: String(error) }
  }
}

// Check if a phantom run completed
export async function getPhantomStatus(params: {
  apiKey: string
  containerId: string
}): Promise<PhantomStatusResult> {
  try {
    const result = await phantomRequest(`/containers/fetch-output?id=${params.containerId}`, 'GET', params.apiKey)
    return {
      status: result['status'] as PhantomStatusResult['status'],
      output: result['output'] as string | undefined,
    }
  } catch (error) {
    return { status: 'error', error: String(error) }
  }
}

// Fetch list of available phantoms for a user
export async function getAvailablePhantoms(apiKey: string) {
  try {
    const result = await phantomRequest('/agents/fetch-all', 'GET', apiKey)
    return result as { agents?: Array<{ id: string; name: string }> }
  } catch {
    return { agents: [] }
  }
}
