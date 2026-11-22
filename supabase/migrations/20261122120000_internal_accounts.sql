-- Internal accounts (staff and test accounts) stay out of the numbers by default. An "actor" is either a user
-- id or a hashed device key, the same values activity_event.actor_id holds, so anonymous testing from a staff
-- browser can be left out too.

create table public.internal_actor (
  actor_id text primary key,
  kind text not null check (kind in ('user', 'device')),
  reason text not null check (reason in ('staff', 'test')),
  created_at timestamptz not null default now()
);
comment on table public.internal_actor is 'Staff and test accounts, and staff devices: excluded from admin metrics unless asked.';
alter table public.internal_actor enable row level security;
revoke all on public.internal_actor from anon, authenticated;
grant select, insert, delete on public.internal_actor to service_role;

/** Test addresses: the end-to-end suite and Sentry checks. */
create function public.is_test_email(p_email text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(p_email ~* '^(e2e-|sentry-check)' or p_email ~* '@example\.com$', false)
$$;

-- Any account that gets a staff role, or has a test address, is internal: flagged on the account itself
-- (app_metadata.is_internal, shown on the Users page) and listed for the metric filters.
create function public.flag_internal_account() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_reason text;
begin
  v_reason := case
    when public.is_test_email(new.email) then 'test'
    when coalesce(new.raw_app_meta_data ->> 'role', '') in ('admin', 'support', 'data_editor') then 'staff'
  end;
  if v_reason is null then
    return new;
  end if;
  if tg_op = 'INSERT' or coalesce((new.raw_app_meta_data ->> 'is_internal')::boolean, false) = false then
    new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('is_internal', true);
  end if;
  insert into public.internal_actor (actor_id, kind, reason)
  values (new.id::text, 'user', v_reason)
  on conflict (actor_id) do nothing;
  return new;
end;
$$;

create trigger flag_internal_account
  before insert or update of raw_app_meta_data, email on auth.users
  for each row execute function public.flag_internal_account();

-- Existing staff and test accounts.
insert into public.internal_actor (actor_id, kind, reason)
select id::text, 'user', case when public.is_test_email(email) then 'test' else 'staff' end
from auth.users
where public.is_test_email(email) or coalesce(raw_app_meta_data ->> 'role', '') in ('admin', 'support', 'data_editor')
on conflict (actor_id) do nothing;
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"is_internal": true}'::jsonb
where id::text in (select actor_id from public.internal_actor where kind = 'user');

/** Removes a deleted test account's activity entirely (erasure of real people only anonymises it). */
create function public.purge_test_activity(p_actor_ids text[]) returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  perform set_config('app.retention', 'on', true);
  delete from public.activity_event where actor_id = any (p_actor_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.purge_test_activity(text[]) from public, anon, authenticated;
grant execute on function public.purge_test_activity(text[]) to service_role;

-- The summaries take an "include internal" switch, off by default.
drop function public.activity_summary(timestamptz, timestamptz);
drop function public.activity_by_target(timestamptz, timestamptz, text[]);
drop function public.search_summary(timestamptz, timestamptz);
drop function public.activity_daily(timestamptz, timestamptz, text[]);

create function public.activity_summary(p_from timestamptz, p_to timestamptz, p_include_internal boolean default false)
returns table (event text, events bigint, actors bigint)
language sql stable security definer set search_path = public as $$
  select e.event, count(*), count(distinct e.actor_id)
  from public.activity_event e
  where e.occurred_at >= p_from and e.occurred_at < p_to
    and (p_include_internal or not exists (select 1 from public.internal_actor i where i.actor_id = e.actor_id))
  group by e.event
$$;

create function public.activity_by_target(
  p_from timestamptz, p_to timestamptz, p_events text[], p_include_internal boolean default false
)
returns table (event text, target_id text, reason text, events bigint)
language sql stable security definer set search_path = public as $$
  select e.event, e.target_id, e.properties ->> 'reason', count(*)
  from public.activity_event e
  where e.occurred_at >= p_from and e.occurred_at < p_to
    and e.event = any (p_events) and e.target_type = 'programme' and e.target_id is not null
    and (p_include_internal or not exists (select 1 from public.internal_actor i where i.actor_id = e.actor_id))
  group by 1, 2, 3
$$;

create function public.search_summary(p_from timestamptz, p_to timestamptz, p_include_internal boolean default false)
returns table (kind text, key text, n bigint)
language sql stable security definer set search_path = public as $$
  with s as (
    select * from public.search_log l
    where l.created_at >= p_from and l.created_at < p_to
      and (p_include_internal or l.user_id is null
           or not exists (select 1 from public.internal_actor i where i.actor_id = l.user_id::text))
  )
  select 'field', f, count(*) from s, unnest(case when cardinality(s.fields) = 0 then array['any'] else s.fields end) f group by 2
  union all
  select 'country', c, count(*) from s, unnest(case when cardinality(s.countries) = 0 then array['any'] else s.countries end) c group by 2
  union all
  select 'budget',
    case
      when budget_ngn_minor is null then 'not given'
      when budget_ngn_minor < 2000000000 then 'under 20m'
      when budget_ngn_minor < 4000000000 then '20m to 40m'
      when budget_ngn_minor < 6000000000 then '40m to 60m'
      when budget_ngn_minor < 8000000000 then '60m to 80m'
      when budget_ngn_minor < 12000000000 then '80m to 120m'
      else '120m and over'
    end, count(*)
  from s group by 2
$$;

create function public.activity_daily(
  p_from timestamptz, p_to timestamptz, p_events text[], p_include_internal boolean default false
)
returns table (day date, event text, events bigint)
language sql stable security definer set search_path = public as $$
  select (e.occurred_at at time zone 'Africa/Lagos')::date, e.event, count(*)
  from public.activity_event e
  where e.occurred_at >= p_from and e.occurred_at < p_to and e.event = any (p_events)
    and (p_include_internal or not exists (select 1 from public.internal_actor i where i.actor_id = e.actor_id))
  group by 1, 2
  order by 1
$$;

revoke all on function public.activity_summary(timestamptz, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.activity_by_target(timestamptz, timestamptz, text[], boolean) from public, anon, authenticated;
revoke all on function public.search_summary(timestamptz, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.activity_daily(timestamptz, timestamptz, text[], boolean) from public, anon, authenticated;
grant execute on function public.activity_summary(timestamptz, timestamptz, boolean) to service_role;
grant execute on function public.activity_by_target(timestamptz, timestamptz, text[], boolean) to service_role;
grant execute on function public.search_summary(timestamptz, timestamptz, boolean) to service_role;
grant execute on function public.activity_daily(timestamptz, timestamptz, text[], boolean) to service_role;
