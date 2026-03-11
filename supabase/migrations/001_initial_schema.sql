-- Users table
create table public.users (
  id uuid references auth.users primary key,
  email text not null,
  name text,
  company_name text,
  company_website text,
  what_you_sell text,
  plan_tier text default 'trial' check (plan_tier in ('trial', 'starter', 'growth', 'scale')),
  stripe_customer_id text,
  stripe_subscription_id text,
  trial_ends_at timestamptz default (now() + interval '14 days'),
  onboarding_completed boolean default false,
  onboarding_step integer default 1,
  created_at timestamptz default now()
);

alter table public.users enable row level security;
create policy "Users can view own data" on public.users for select using (auth.uid() = id);
create policy "Users can insert own data" on public.users for insert with check (auth.uid() = id);
create policy "Users can update own data" on public.users for update using (auth.uid() = id);

-- ICP table
create table public.user_icp (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users not null,
  target_title text,
  target_industry text,
  target_company_size text,
  target_country text,
  notes text,
  created_at timestamptz default now()
);

alter table public.user_icp enable row level security;
create policy "Users can manage own ICP" on public.user_icp for all using (auth.uid() = user_id);

-- Leads table
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users not null,
  first_name text,
  last_name text,
  email text,
  phone text,
  company text,
  title text,
  linkedin_url text,
  website text,
  source text default 'manual' check (source in ('manual', 'csv', 'linkedin_url', 'apollo', 'content_reactor')),
  enrichment_data jsonb,
  persuasion_profile text check (persuasion_profile in ('analytical', 'visionary', 'relational', 'driver')),
  enrichment_status text default 'pending' check (enrichment_status in ('pending', 'processing', 'completed', 'failed')),
  enriched_at timestamptz,
  engagement_score integer default 0 check (engagement_score between 0 and 10),
  is_warm boolean default false,
  stage text default 'new' check (stage in ('new', 'enriched', 'contacted', 'connected', 'engaged', 'warm', 'meeting_booked', 'closed_won', 'closed_lost', 'expired')),
  dedup_hash text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.leads enable row level security;
create policy "Users can manage own leads" on public.leads for all using (auth.uid() = user_id);
create unique index leads_dedup_idx on public.leads (user_id, dedup_hash) where dedup_hash is not null;
create unique index leads_linkedin_idx on public.leads (user_id, linkedin_url) where linkedin_url is not null;
create unique index leads_email_idx on public.leads (user_id, email) where email is not null;

-- Outreach messages
create table public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads not null,
  user_id uuid references public.users not null,
  channel text not null check (channel in ('linkedin_request', 'linkedin_dm', 'email_1', 'email_2', 'email_3', 'email_4')),
  subject text,
  content text not null,
  prompt_version integer default 1,
  status text default 'draft' check (status in ('draft', 'approved', 'sent', 'opened', 'replied')),
  sent_at timestamptz,
  created_at timestamptz default now()
);

alter table public.outreach_messages enable row level security;
create policy "Users can manage own messages" on public.outreach_messages for all using (auth.uid() = user_id);

-- Lead imports
create table public.lead_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users not null,
  source text not null,
  total_rows integer,
  imported integer default 0,
  duplicates_skipped integer default 0,
  errors integer default 0,
  status text default 'processing' check (status in ('processing', 'completed', 'failed')),
  created_at timestamptz default now()
);

alter table public.lead_imports enable row level security;
create policy "Users can manage own imports" on public.lead_imports for all using (auth.uid() = user_id);

-- Function to auto-create user profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
