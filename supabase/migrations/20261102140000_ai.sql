-- AI usage logging, subscriptions, advisor quota and explanation cache.
-- All writes happen server-side with the service role; clients only read their own plan.

-- ---------------------------------------------------------------------------
-- ai_usage: one row per model call (successful or not)
-- ---------------------------------------------------------------------------
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  task text not null,
  provider text not null,
  model text not null,
  input_tokens int check (input_tokens >= 0),
  output_tokens int check (output_tokens >= 0),
  latency_ms int not null check (latency_ms >= 0),
  success boolean not null,
  error text,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index ai_usage_created_idx on public.ai_usage (created_at desc);
create index ai_usage_task_day_idx on public.ai_usage (task, created_at);

-- Daily totals per task, in Lagos time (the product's home market).
create view public.ai_usage_daily with (security_invoker = true) as
select (created_at at time zone 'Africa/Lagos')::date as day,
       task,
       provider,
       model,
       count(*)::int as calls,
       count(*) filter (where not success)::int as failures,
       coalesce(sum(input_tokens), 0)::bigint as input_tokens,
       coalesce(sum(output_tokens), 0)::bigint as output_tokens,
       round(avg(latency_ms))::int as avg_latency_ms
from public.ai_usage
group by 1, 2, 3, 4;

-- ---------------------------------------------------------------------------
-- subscription: plan per user. Separate from student_profile so a student can't
-- upgrade themselves (they may update their own profile row).
-- ---------------------------------------------------------------------------
create type public.plan_tier as enum ('free', 'plus');

create table public.subscription (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan public.plan_tier not null default 'free',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subscription_set_updated_at before update on public.subscription
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Advisor quota: free users get FREE_ADVISOR_MESSAGES_PER_DAY messages per Lagos day.
-- ---------------------------------------------------------------------------
create table public.advisor_daily_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  messages int not null default 0 check (messages >= 0),
  primary key (user_id, day)
);

-- Atomically records one advisor message if the user is allowed another today.
-- Returns allowed = false (and does not count) once a free user has used the limit.
create function public.consume_advisor_message(p_user_id uuid, p_free_limit int default 5)
returns table (allowed boolean, used int, daily_limit int, plan public.plan_tier)
language plpgsql security definer set search_path = '' as $$
declare
  v_plan public.plan_tier;
  v_day date := (now() at time zone 'Africa/Lagos')::date;
  v_used int;
begin
  select s.plan into v_plan from public.subscription s
  where s.user_id = p_user_id and (s.current_period_end is null or s.current_period_end > now());
  v_plan := coalesce(v_plan, 'free');

  if v_plan = 'plus' then
    insert into public.advisor_daily_usage as a (user_id, day, messages) values (p_user_id, v_day, 1)
    on conflict (user_id, day) do update set messages = a.messages + 1
    returning a.messages into v_used;
    return query select true, v_used, null::int, v_plan;
    return;
  end if;

  -- The conditional upsert only increments while under the limit, so concurrent
  -- requests can never push a free user past it.
  insert into public.advisor_daily_usage as a (user_id, day, messages) values (p_user_id, v_day, 1)
  on conflict (user_id, day) do update set messages = a.messages + 1 where a.messages < p_free_limit
  returning a.messages into v_used;

  if v_used is null then
    select a.messages into v_used from public.advisor_daily_usage a where a.user_id = p_user_id and a.day = v_day;
    return query select false, v_used, p_free_limit, v_plan;
  else
    return query select true, v_used, p_free_limit, v_plan;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- explanation_cache: one generated explanation per (programme, profile bucket),
-- reused until the programme's source data changes (source_version).
-- ---------------------------------------------------------------------------
create table public.explanation_cache (
  programme_id uuid not null references public.programme (id) on delete cascade,
  profile_bucket text not null,
  source_version text not null,
  content text not null,
  provider text not null,
  model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (programme_id, profile_bucket)
);
create trigger explanation_cache_set_updated_at before update on public.explanation_cache
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
alter table public.ai_usage enable row level security;
alter table public.advisor_daily_usage enable row level security;
alter table public.explanation_cache enable row level security;
alter table public.subscription enable row level security;

revoke all on public.ai_usage, public.ai_usage_daily, public.advisor_daily_usage, public.explanation_cache
  from anon, authenticated;
grant all on public.ai_usage, public.advisor_daily_usage, public.explanation_cache to service_role;
grant select on public.ai_usage_daily to service_role;

revoke all on public.subscription from anon, authenticated;
grant select on public.subscription to authenticated;
grant all on public.subscription to service_role;
create policy subscription_owner_read on public.subscription
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on function public.consume_advisor_message(uuid, int) from public, anon, authenticated;
grant execute on function public.consume_advisor_message(uuid, int) to service_role;
