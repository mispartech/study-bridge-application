-- Summaries for the admin console (docs/SPEC_ACCESS_ADMIN.md, section 5). Counting happens in the database,
-- so the console never pulls raw activity rows into the app. Service role only.

/** Events and distinct actors per event in a date range: the funnel and the headline numbers. */
create function public.activity_summary(p_from timestamptz, p_to timestamptz)
returns table (event text, events bigint, actors bigint)
language sql stable security definer set search_path = public as $$
  select e.event, count(*), count(distinct e.actor_id)
  from public.activity_event e
  where e.occurred_at >= p_from and e.occurred_at < p_to
  group by e.event
$$;

/** Per programme: how often each event happened, split by reason where the event has one. */
create function public.activity_by_target(p_from timestamptz, p_to timestamptz, p_events text[])
returns table (event text, target_id text, reason text, events bigint)
language sql stable security definer set search_path = public as $$
  select e.event, e.target_id, e.properties ->> 'reason', count(*)
  from public.activity_event e
  where e.occurred_at >= p_from and e.occurred_at < p_to
    and e.event = any (p_events) and e.target_type = 'programme' and e.target_id is not null
  group by 1, 2, 3
$$;

/** What students ask for: course, country and budget band (naira), from the search log. */
create function public.search_summary(p_from timestamptz, p_to timestamptz)
returns table (kind text, key text, n bigint)
language sql stable security definer set search_path = public as $$
  with s as (select * from public.search_log where created_at >= p_from and created_at < p_to)
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

/** One row per day in the range for an event: for the trend lines. Days are Lagos days. */
create function public.activity_daily(p_from timestamptz, p_to timestamptz, p_events text[])
returns table (day date, event text, events bigint)
language sql stable security definer set search_path = public as $$
  select (e.occurred_at at time zone 'Africa/Lagos')::date, e.event, count(*)
  from public.activity_event e
  where e.occurred_at >= p_from and e.occurred_at < p_to and e.event = any (p_events)
  group by 1, 2
  order by 1
$$;

revoke all on function public.activity_summary(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.activity_by_target(timestamptz, timestamptz, text[]) from public, anon, authenticated;
revoke all on function public.search_summary(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.activity_daily(timestamptz, timestamptz, text[]) from public, anon, authenticated;
grant execute on function public.activity_summary(timestamptz, timestamptz) to service_role;
grant execute on function public.activity_by_target(timestamptz, timestamptz, text[]) to service_role;
grant execute on function public.search_summary(timestamptz, timestamptz) to service_role;
grant execute on function public.activity_daily(timestamptz, timestamptz, text[]) to service_role;
