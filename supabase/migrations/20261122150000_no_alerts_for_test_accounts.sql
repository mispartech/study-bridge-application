-- One Supabase project: the end-to-end tests make and remove staff accounts on every run. Those role changes
-- are still audited, but don't email the admins; a real account's change always does.
create or replace function public.queue_role_change_alert() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_before text := coalesce(case when tg_op = 'UPDATE' then old.raw_app_meta_data ->> 'role' end, 'student');
  v_after text := coalesce(new.raw_app_meta_data ->> 'role', 'student');
  v_test boolean := public.is_test_email(new.email);
  v_id bigint;
  v_url text;
begin
  if v_before = v_after then
    return new;
  end if;
  insert into public.staff_audit (staff_id, staff_email, action, target_type, target_id, before, after, reason)
  values ('00000000-0000-0000-0000-000000000000', 'system', 'role_change_detected', 'user', new.id::text,
          jsonb_build_object('role', v_before), jsonb_build_object('role', v_after),
          case when v_test then 'Recorded by the database trigger; test account, no email'
               else 'Recorded by the database trigger; admins emailed' end);
  if v_test then
    return new;
  end if;
  insert into public.role_change_alert (user_id, email, before_role, after_role)
  values (new.id, new.email, v_before, v_after)
  returning id into v_id;
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
