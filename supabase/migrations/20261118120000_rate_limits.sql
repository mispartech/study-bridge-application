-- Rate limits for anonymous use (spec: value-first access). Keys are HMAC hashes of a device id or an IP
-- address, never the raw values. Counting happens in one statement, so parallel requests can't exceed a limit.

create table public.rate_limit (
  bucket text not null,
  key_hash text not null,
  window_start timestamptz not null,
  hits int not null default 0 check (hits >= 0),
  primary key (bucket, key_hash, window_start)
);
comment on table public.rate_limit is 'Hits per bucket, hashed key and time window. Rows older than two days are removed as new ones arrive.';

alter table public.rate_limit enable row level security;
revoke all on public.rate_limit from anon, authenticated;
grant all on public.rate_limit to service_role;

/** Start of the current window. p_offset_seconds shifts it, e.g. 3600 for days that start at midnight Lagos time. */
create function public.rate_limit_window(p_window_seconds int, p_offset_seconds int)
returns timestamptz language sql stable as $$
  select to_timestamp(
    floor((extract(epoch from now()) + p_offset_seconds) / p_window_seconds) * p_window_seconds - p_offset_seconds
  )
$$;

/** Counts one hit if the key is under its limit. Returns whether it was allowed and the hits in this window. */
create function public.hit_rate_limit(
  p_bucket text, p_key_hash text, p_window_seconds int, p_limit int, p_offset_seconds int default 0
) returns table (allowed boolean, hits int)
language plpgsql security definer set search_path = public as $$
declare
  v_window timestamptz := public.rate_limit_window(p_window_seconds, p_offset_seconds);
  v_hits int;
begin
  insert into public.rate_limit as r (bucket, key_hash, window_start, hits)
  values (p_bucket, p_key_hash, v_window, 1)
  on conflict (bucket, key_hash, window_start) do update set hits = r.hits + 1 where r.hits < p_limit
  returning r.hits into v_hits;

  if random() < 0.01 then
    delete from public.rate_limit where window_start < now() - interval '2 days';
  end if;

  if v_hits is null then
    select r.hits into v_hits from public.rate_limit r
    where r.bucket = p_bucket and r.key_hash = p_key_hash and r.window_start = v_window;
    return query select false, v_hits;
  else
    return query select true, v_hits;
  end if;
end;
$$;

/** Gives back one hit, e.g. when the model failed to answer. */
create function public.refund_rate_limit(
  p_bucket text, p_key_hash text, p_window_seconds int, p_offset_seconds int default 0
) returns int
language sql security definer set search_path = public as $$
  update public.rate_limit set hits = greatest(hits - 1, 0)
  where bucket = p_bucket and key_hash = p_key_hash
    and window_start = public.rate_limit_window(p_window_seconds, p_offset_seconds)
  returning hits
$$;

revoke all on function public.hit_rate_limit(text, text, int, int, int) from public, anon, authenticated;
revoke all on function public.refund_rate_limit(text, text, int, int) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, text, int, int, int) to service_role;
grant execute on function public.refund_rate_limit(text, text, int, int) to service_role;
