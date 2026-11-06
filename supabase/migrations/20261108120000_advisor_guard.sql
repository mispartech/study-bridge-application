-- Number guard log and refunds for advisor messages the model failed to answer.

-- One row each time the guard rejects a draft. Holds the rejected figures, never the conversation.
create table public.advisor_guard_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  attempt int not null,
  outcome text not null check (outcome in ('regenerated', 'safe_message')),
  figures text[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.advisor_guard_log enable row level security;
revoke all on public.advisor_guard_log from anon, authenticated;
grant all on public.advisor_guard_log to service_role;
comment on table public.advisor_guard_log is 'Service role only: no client policy on purpose.';

-- Gives back today's message when the model failed. Never goes below zero.
create function public.refund_advisor_message(p_user_id uuid)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_day date := (now() at time zone 'Africa/Lagos')::date;
  v_used int;
begin
  update public.advisor_daily_usage a set messages = greatest(a.messages - 1, 0)
  where a.user_id = p_user_id and a.day = v_day
  returning a.messages into v_used;
  return coalesce(v_used, 0);
end $$;
revoke all on function public.refund_advisor_message(uuid) from public, anon, authenticated;
grant execute on function public.refund_advisor_message(uuid) to service_role;
