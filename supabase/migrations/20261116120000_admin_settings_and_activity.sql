-- Admin settings that change without a deploy (model per task, model prices, advisor limit),
-- and a log of searches so admins can see activity per user. Both are service-role only.

create table public.app_setting (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
comment on table public.app_setting is 'Admin-editable settings. Code defaults apply when a key is absent.';

create table public.search_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  fields text[] not null default '{}',
  countries text[] not null default '{}',
  budget_ngn_minor bigint,
  ranked int not null default 0,
  near_misses int not null default 0,
  data_confidence int check (data_confidence between 0 and 100)
);
comment on table public.search_log is 'One row per match request. No grades or names; user_id is null when signed out.';
create index search_log_user_created on public.search_log (user_id, created_at desc);
create index search_log_created on public.search_log (created_at desc);
create index ai_usage_user_created on public.ai_usage (user_id, created_at desc);

alter table public.app_setting enable row level security;
alter table public.search_log enable row level security;
revoke all on public.app_setting, public.search_log from anon, authenticated;
grant all on public.app_setting, public.search_log to service_role;
