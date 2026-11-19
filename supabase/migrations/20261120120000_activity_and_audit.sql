-- Activity tracking and the staff audit log (docs/SPEC_ACCESS_ADMIN.md, section 4).
-- Both are append-only: triggers refuse updates and deletes, even with the service key. Activity can be
-- removed only by the retention job (after 24 months); the audit log can never be changed.

create type public.actor_type as enum ('anonymous', 'student', 'staff', 'system');

create table public.activity_event (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_type public.actor_type not null,
  -- A user id, or a hash of the anonymous device id. Never an email or name.
  actor_id text,
  session_id text,
  event text not null,
  target_type text,
  target_id text,
  -- Validated per event before insert: enums, numbers and ids only, never free text from users.
  properties jsonb not null default '{}'::jsonb,
  ip_hash text,
  user_agent_family text
);
create index activity_event_occurred on public.activity_event (occurred_at desc);
create index activity_event_event_occurred on public.activity_event (event, occurred_at desc);
create index activity_event_actor on public.activity_event (actor_id, occurred_at desc);
create index activity_event_target on public.activity_event (target_type, target_id);
comment on table public.activity_event is 'Append-only. Deleted only by purge_activity_events() after 24 months.';

create table public.staff_audit (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  staff_id uuid not null,
  staff_email text,
  action text not null,
  target_type text,
  target_id text,
  before jsonb,
  after jsonb,
  reason text
);
create index staff_audit_occurred on public.staff_audit (occurred_at desc);
create index staff_audit_staff on public.staff_audit (staff_id, occurred_at desc);
create index staff_audit_action on public.staff_audit (action, occurred_at desc);
comment on table public.staff_audit is 'Append-only, forever. Every staff action with before and after values.';

create function public.refuse_change() returns trigger language plpgsql as $$
begin
  -- The retention job sets this for its own transaction only.
  if tg_table_name = 'activity_event' and tg_op = 'DELETE' and current_setting('app.retention', true) = 'on' then
    return old;
  end if;
  raise exception '% is append-only', tg_table_name using errcode = 'insufficient_privilege';
end;
$$;

create trigger activity_event_append_only before update or delete on public.activity_event
  for each row execute function public.refuse_change();
create trigger staff_audit_append_only before update or delete on public.staff_audit
  for each row execute function public.refuse_change();
-- TRUNCATE skips row triggers, so it is refused separately.
create trigger activity_event_no_truncate before truncate on public.activity_event
  for each statement execute function public.refuse_change();
create trigger staff_audit_no_truncate before truncate on public.staff_audit
  for each statement execute function public.refuse_change();

/** The only way activity leaves the table: anything older than 24 months. */
create function public.purge_activity_events() returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  perform set_config('app.retention', 'on', true);
  delete from public.activity_event where occurred_at < now() - interval '24 months';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

alter table public.activity_event enable row level security;
alter table public.staff_audit enable row level security;
revoke all on public.activity_event, public.staff_audit from anon, authenticated;
grant select, insert on public.activity_event, public.staff_audit to service_role;
revoke all on function public.purge_activity_events() from public, anon, authenticated;
grant execute on function public.purge_activity_events() to service_role;
