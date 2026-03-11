import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10',
  typescript: true,
})

export const PRICE_IDS = {
  starter: process.env.STRIPE_STARTER_PRICE_ID!,
  growth: process.env.STRIPE_GROWTH_PRICE_ID!,
  scale: process.env.STRIPE_SCALE_PRICE_ID!,
}

export const PLAN_LIMITS: Record<string, { leadsPerDay: number }> = {
  trial: { leadsPerDay: 1 },
  starter: { leadsPerDay: 1 },
  growth: { leadsPerDay: 2 },
  scale: { leadsPerDay: 5 },
}

export async function createCheckoutSession(params: {
  customerId?: string
  priceId: string
  userId: string
  email: string
  successUrl: string
  cancelUrl: string
}) {
  return stripe.checkout.sessions.create({
    customer: params.customerId,
    customer_email: params.customerId ? undefined : params.email,
    mode: 'subscription',
    line_items: [{ price: params.priceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: { userId: params.userId },
    subscription_data: { trial_period_days: 14 },
    allow_promotion_codes: true,
  })
}

export async function createPortalSession(customerId: string, returnUrl: string) {
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  })
}
