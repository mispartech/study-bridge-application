-- Daily AI usage like the ai_usage_daily view, but able to leave out internal (staff and test) accounts.
-- Calls with no user (ingestion, evals, anonymous advisor) always count. Service role only.
create function public.ai_usage_daily_summary(p_since date, p_include_internal boolean default false)
returns table (
  day date, task text, provider text, model text,
  calls int, failures int, input_tokens bigint, output_tokens bigint, avg_latency_ms int
)
language sql stable security definer set search_path = public as $$
  select (u.created_at at time zone 'Africa/Lagos')::date, u.task, u.provider, u.model,
         count(*)::int, (count(*) filter (where not u.success))::int,
         coalesce(sum(u.input_tokens), 0)::bigint, coalesce(sum(u.output_tokens), 0)::bigint,
         round(avg(u.latency_ms))::int
  from public.ai_usage u
  where (u.created_at at time zone 'Africa/Lagos')::date >= p_since
    and (p_include_internal or u.user_id is null
         or not exists (select 1 from public.internal_actor i where i.actor_id = u.user_id::text))
  group by 1, 2, 3, 4
$$;
revoke all on function public.ai_usage_daily_summary(date, boolean) from public, anon, authenticated;
grant execute on function public.ai_usage_daily_summary(date, boolean) to service_role;

-- Ids of accounts deleted by the cleanup no longer need listing.
delete from public.internal_actor i
where i.kind = 'user' and not exists (select 1 from auth.users u where u.id::text = i.actor_id);
