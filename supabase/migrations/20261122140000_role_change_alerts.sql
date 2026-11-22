-- Any change to a staff role, however it's made (the admin console, the grant script, the Supabase dashboard,
-- SQL), is audited here and queued for an immediate email to every admin. The trigger calls the app over
-- pg_net with just the queue id; the app re-reads the row with the service key and claims it once, so the call
-- carries no secret and a repeated or forged call can't send anything that wasn't queued.

create extension if not exists pg_net with schema extensions;

create table public.role_change_alert (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null,
  email text,
  before_role text not null,
  after_role text not null,
  sent_at timestamptz
);
comment on table public.role_change_alert is 'Staff role changes waiting to be (or already) emailed to admins.';
alter table public.role_change_alert enable row level security;
revoke all on public.role_change_alert from anon, authenticated;
grant select, update on public.role_change_alert to service_role;

create table public.alert_endpoint (
  id boolean primary key default true check (id),
  url text not null
);
comment on table public.alert_endpoint is 'Where the database posts role-change alerts: the production site.';
alter table public.alert_endpoint enable row level security;
revoke all on public.alert_endpoint from anon, authenticated;
grant select, update on public.alert_endpoint to service_role;
insert into public.alert_endpoint (url) values ('https://studybridge.mispartechnologies.com/api/security/role-alert');

create function public.queue_role_change_alert() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_before text := coalesce(case when tg_op = 'UPDATE' then old.raw_app_meta_data ->> 'role' end, 'student');
  v_after text := coalesce(new.raw_app_meta_data ->> 'role', 'student');
  v_id bigint;
  v_url text;
begin
  if v_before = v_after then
    return new;
  end if;
  insert into public.role_change_alert (user_id, email, before_role, after_role)
  values (new.id, new.email, v_before, v_after)
  returning id into v_id;
  -- Recorded by the database itself, so even a change made outside the app leaves a trace.
  insert into public.staff_audit (staff_id, staff_email, action, target_type, target_id, before, after, reason)
  values ('00000000-0000-0000-0000-000000000000', 'system', 'role_change_detected', 'user', new.id::text,
          jsonb_build_object('role', v_before), jsonb_build_object('role', v_after),
          'Recorded by the database trigger; admins emailed');
  select url into v_url from public.alert_endpoint;
  if v_url is not null then
    perform net.http_post(
      url := v_url,
      body := jsonb_build_object('id', v_id),
      headers := '{"content-type": "application/json"}'::jsonb
    );
  end if;
  return new;
end;
$$;

create trigger queue_role_change_alert
  after insert or update of raw_app_meta_data on auth.users
  for each row execute function public.queue_role_change_alert();
