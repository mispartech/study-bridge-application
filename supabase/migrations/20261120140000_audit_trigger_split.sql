-- One shared trigger function referred to activity_event's columns, so on staff_audit Postgres raised
-- "record new has no field actor_id" instead of the intended message. Each table gets its own function.

create function public.refuse_audit_change() returns trigger language plpgsql as $$
begin
  raise exception 'staff_audit is append-only' using errcode = 'insufficient_privilege';
end;
$$;

drop trigger staff_audit_append_only on public.staff_audit;
drop trigger staff_audit_no_truncate on public.staff_audit;
create trigger staff_audit_append_only before update or delete on public.staff_audit
  for each row execute function public.refuse_audit_change();
create trigger staff_audit_no_truncate before truncate on public.staff_audit
  for each statement execute function public.refuse_audit_change();

-- activity_event keeps refuse_change(), which now only ever runs on activity_event.
create or replace function public.refuse_change() returns trigger language plpgsql as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'activity_event is append-only' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'DELETE' and current_setting('app.retention', true) = 'on' then
    return old;
  end if;
  -- Anonymising may clear who did it, and nothing else.
  if tg_op = 'UPDATE' and current_setting('app.anonymise', true) = 'on'
     and new.actor_id is null and new.session_id is null and new.ip_hash is null
     and (new.occurred_at, new.actor_type, new.event, new.target_type, new.target_id, new.properties, new.user_agent_family)
         is not distinct from
         (old.occurred_at, old.actor_type, old.event, old.target_type, old.target_id, old.properties, old.user_agent_family)
  then
    return new;
  end if;
  raise exception 'activity_event is append-only' using errcode = 'insufficient_privilege';
end;
$$;
