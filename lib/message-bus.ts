// Upstash Redis message bus for agent coordination
// Falls back gracefully if Redis is not configured

export interface AgentEvent {
  type: string
  from: string
  to: string
  payload: Record<string, unknown>
  timestamp?: string
}

// Lazy Redis client — only connects when needed
let redisClient: unknown = null

async function getRedis() {
  if (!process.env.UPSTASH_REDIS_URL || !process.env.UPSTASH_REDIS_TOKEN) {
    return null
  }

  if (!redisClient) {
    try {
      const { Redis } = await import('@upstash/redis')
      redisClient = new Redis({
        url: process.env.UPSTASH_REDIS_URL,
        token: process.env.UPSTASH_REDIS_TOKEN,
      })
    } catch {
      console.warn('[MessageBus] @upstash/redis not installed — run npm install @upstash/redis')
      return null
    }
  }

  return redisClient as {
    lpush: (key: string, ...values: string[]) => Promise<number>
    rpop: (key: string) => Promise<string | null>
    llen: (key: string) => Promise<number>
  }
}

// Publish an event to the message bus
export async function publishEvent(event: AgentEvent): Promise<boolean> {
  const redis = await getRedis()
  if (!redis) {
    console.log(`[MessageBus] Event (no Redis): ${event.from} → ${event.to} — ${event.type}`, event.payload)
    return false
  }

  const key = `pipeloop:events:${event.to}`
  const value = JSON.stringify({ ...event, timestamp: new Date().toISOString() })
  await redis.lpush(key, value)
  return true
}

// Consume next event for an agent (blocking pop equivalent)
export async function consumeNextEvent(agentName: string): Promise<AgentEvent | null> {
  const redis = await getRedis()
  if (!redis) return null

  const key = `pipeloop:events:${agentName}`
  const raw = await redis.rpop(key)
  if (!raw) return null

  try {
    return JSON.parse(raw) as AgentEvent
  } catch {
    return null
  }
}

// Check how many events are queued for an agent
export async function getQueueDepth(agentName: string): Promise<number> {
  const redis = await getRedis()
  if (!redis) return 0

  const key = `pipeloop:events:${agentName}`
  return redis.llen(key)
}

// Common events
export const EVENTS = {
  LEAD_ENRICHED: 'lead.enriched',
  MESSAGE_GENERATED: 'message.generated',
  MESSAGE_APPROVED: 'message.approved',
  MESSAGE_SENT: 'message.sent',
  LINKEDIN_ACCEPTED: 'linkedin.accepted',
  LINKEDIN_REPLIED: 'linkedin.replied',
  EMAIL_OPENED: 'email.opened',
  EMAIL_REPLIED: 'email.replied',
  LEAD_WARM: 'lead.warm',
  REPORT_GENERATED: 'report.generated',
} as const
