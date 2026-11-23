-- Saves one pathway and its signal weights in a single transaction, so matching never sees a pathway with half
-- its weights. Called by the admin API with the service key; the API audits the change. Additive only.

create function public.save_pathway(
  p_key text,
  p_label text,
  p_description text,
  p_active boolean,
  p_sort_order int,
  p_signals jsonb,
  p_staff uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.pathway (key, label, description, active, sort_order, updated_by, updated_at)
  values (p_key, p_label, p_description, p_active, p_sort_order, p_staff, now())
  on conflict (key) do update
    set label = excluded.label,
        description = excluded.description,
        active = excluded.active,
        sort_order = excluded.sort_order,
        updated_by = excluded.updated_by,
        updated_at = now();
  delete from public.pathway_signal where pathway_key = p_key;
  insert into public.pathway_signal (pathway_key, signal, weight)
  select p_key, s.key, (s.value)::int
  from jsonb_each_text(coalesce(p_signals, '{}'::jsonb)) s
  where (s.value)::int > 0;
end;
$$;

revoke all on function public.save_pathway(text, text, text, boolean, int, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.save_pathway(text, text, text, boolean, int, jsonb, uuid) to service_role;
