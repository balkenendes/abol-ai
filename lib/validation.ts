import { z } from 'zod'

export const leadSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  company: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  title: z.string().optional(),
  linkedin_url: z.string().url().optional().or(z.literal('')),
  website: z.string().optional(),
})

export const importCSVSchema = z.object({
  leads: z.array(leadSchema).min(1).max(500),
})

export const importLinkedInSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(100),
})

export const onboardingStep1Schema = z.object({
  company_name: z.string().min(1),
  company_website: z.string().url(),
  what_you_sell: z.string().min(10),
})

export const onboardingStep2Schema = z.object({
  target_title: z.string().min(1),
  target_industry: z.string().min(1),
  target_company_size: z.string().min(1),
  target_country: z.string().min(1),
})

export type LeadInput = z.infer<typeof leadSchema>
export type OnboardingStep1Input = z.infer<typeof onboardingStep1Schema>
export type OnboardingStep2Input = z.infer<typeof onboardingStep2Schema>
