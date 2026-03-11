let isProcessing = false
const queue: string[] = []

export function addToEnrichmentQueue(leadId: string) {
  if (!queue.includes(leadId)) {
    queue.push(leadId)
  }
  if (!isProcessing) {
    void processQueue()
  }
}

async function processQueue() {
  if (isProcessing || queue.length === 0) return
  isProcessing = true

  while (queue.length > 0) {
    const leadId = queue.shift()!
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/leads/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId }),
      })
    } catch (error) {
      console.error('Enrichment queue error:', error)
    }
    if (queue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  isProcessing = false
}
