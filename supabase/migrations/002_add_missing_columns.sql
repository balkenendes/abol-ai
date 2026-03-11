-- Migration 002: Add missing columns
-- Run this after 001_initial_schema.sql in Supabase SQL Editor

-- Add onboarding_step to users (tracks current wizard step)
alter table public.users
  add column if not exists onboarding_step integer default 1;

-- Add apollo_api_key to users (Nova uses this per-user)
alter table public.users
  add column if not exists apollo_api_key text;

-- Add CRON_SECRET env var note:
-- Set CRON_SECRET in Vercel environment variables to secure the cron endpoints
-- Generate a random 32-char string: openssl rand -hex 16

-- RLS for agent_messages and agent_logs (no user RLS — internal use only)
alter table public.agent_messages enable row level security;
alter table public.agent_logs enable row level security;
alter table public.daily_reports enable row level security;

-- Only service_role can access internal agent tables
create policy "service_role_only_agent_messages" on public.agent_messages
  for all using (false);

create policy "service_role_only_agent_logs" on public.agent_logs
  for all using (false);

create policy "service_role_only_daily_reports" on public.daily_reports
  for all using (false);
