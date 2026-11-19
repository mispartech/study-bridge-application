-- Erasure (NDPA): when an account is deleted its activity stays for the totals, but stops pointing at the
-- person. This is the one change activity_event allows, and only through anonymise_activity().

create or replace function public.refuse_change() returns trigger language plpgsql as $$
begin
  if tg_table_name = 'activity_event' and tg_op = 'DELETE' and current_setting('app.retention', true) = 'on' then
    return old;
  end if;
  -- Anonymising may clear who did it, and nothing else.
  if tg_table_name = 'activity_event' and tg_op = 'UPDATE' and current_setting('app.anonymise', true) = 'on'
     and new.actor_id is null and new.session_id is null and new.ip_hash is null
     and (new.occurred_at, new.actor_type, new.event, new.target_type, new.target_id, new.properties, new.user_agent_family)
         is not distinct from
         (old.occurred_at, old.actor_type, old.event, old.target_type, old.target_id, old.properties, old.user_agent_family)
  then
    return new;
  end if;
  raise exception '% is append-only', tg_table_name using errcode = 'insufficient_privilege';
end;
$$;

create function public.anonymise_activity(p_actor_id text) returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  perform set_config('app.anonymise', 'on', true);
  update public.activity_event set actor_id = null, session_id = null, ip_hash = null where actor_id = p_actor_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.anonymise_activity(text) from public, anon, authenticated;
grant execute on function public.anonymise_activity(text) to service_role;
