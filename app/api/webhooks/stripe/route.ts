export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import Stripe from 'stripe'
import { adminClient } from '@/lib/supabase/admin'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10',
})

const PRICE_TO_PLAN: Record<string, string> = {
  [process.env.STRIPE_STARTER_PRICE_ID ?? 'price_starter']: 'starter',
  [process.env.STRIPE_GROWTH_PRICE_ID ?? 'price_growth']: 'growth',
  [process.env.STRIPE_SCALE_PRICE_ID ?? 'price_scale']: 'scale',
}

async function getUserByCustomerId(customerId: string): Promise<string | null> {
  const { data } = await adminClient
    .from('users')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single()
  return data?.id ?? null
}

async function updateUserPlan(userId: string, planTier: string, subscriptionId: string) {
  await adminClient
    .from('users')
    .update({
      plan_tier: planTier,
      stripe_subscription_id: subscriptionId,
    })
    .eq('id', userId)
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const customerId = session.customer as string
        const subscriptionId = session.subscription as string

        if (!customerId || !subscriptionId) break

        // Save customer ID to user record
        const userId = await getUserByCustomerId(customerId)

        if (!userId && session.client_reference_id) {
          // First time: client_reference_id is user ID
          const priceId = session.metadata?.['price_id'] ?? ''
          const planTier = PRICE_TO_PLAN[priceId] ?? 'starter'

          await adminClient
            .from('users')
            .update({
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              plan_tier: planTier,
            })
            .eq('id', session.client_reference_id)
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string
        const userId = await getUserByCustomerId(customerId)

        if (!userId) break

        const priceId = subscription.items.data[0]?.price.id ?? ''
        const planTier = PRICE_TO_PLAN[priceId]

        if (planTier) {
          await updateUserPlan(userId, planTier, subscription.id)
        }

        // Handle cancellation
        if (subscription.status === 'canceled' || subscription.cancel_at_period_end) {
          await adminClient
            .from('users')
            .update({ plan_tier: 'trial' })
            .eq('id', userId)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string
        const userId = await getUserByCustomerId(customerId)

        if (!userId) break

        await adminClient
          .from('users')
          .update({
            plan_tier: 'trial',
            stripe_subscription_id: null,
          })
          .eq('id', userId)
        break
      }

      default:
        // Ignore other events
        break
    }
  } catch (error) {
    console.error('Webhook handler error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
