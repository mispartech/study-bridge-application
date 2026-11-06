-- Row Level Security (docs/SPEC_DATA.md, "RLS summary").
--   Student tables: the signed-in owner only.
--   Content tables + fx_rate: readable by everyone, writable only by service_role.
--   source_audit, review_queue: service_role only.
-- service_role bypasses RLS, so it needs no policies. Grants are narrowed as well,
-- so a missing policy can never be the only thing standing between a client and a write.

-- Content: read-only to clients ------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'university', 'programme', 'requirement', 'intake', 'fee', 'city_cost',
    'scholarship', 'visa_rule', 'grade_mapping', 'fx_rate'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_read', t);
  end loop;
end $$;

-- Ingestion bookkeeping: no client access ---------------------------------------
alter table public.source_audit enable row level security;
alter table public.review_queue enable row level security;
revoke all on public.source_audit, public.review_queue from anon, authenticated;
grant all on public.source_audit, public.review_queue to service_role;

-- Student data: owner only --------------------------------------------------------
alter table public.student_profile enable row level security;
alter table public.shortlist enable row level security;
alter table public.application_tracker enable row level security;

revoke all on public.student_profile, public.shortlist, public.application_tracker from anon, authenticated;
grant select, insert, update, delete on public.student_profile, public.shortlist, public.application_tracker to authenticated;
grant all on public.student_profile, public.shortlist, public.application_tracker to service_role;

-- (select auth.uid()) is evaluated once per statement instead of once per row.
create policy student_profile_owner on public.student_profile
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- The student's own profile id. security definer so policies on other tables can
-- resolve it without depending on student_profile's own policies.
create function public.current_student_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.student_profile where user_id = (select auth.uid())
$$;
revoke all on function public.current_student_id() from public, anon;
grant execute on function public.current_student_id() to authenticated, service_role;

create policy shortlist_owner on public.shortlist
  for all to authenticated
  using (student_id = (select public.current_student_id()))
  with check (student_id = (select public.current_student_id()));

create policy application_tracker_owner on public.application_tracker
  for all to authenticated
  using (student_id = (select public.current_student_id()))
  with check (student_id = (select public.current_student_id()));

-- Helper functions in this schema are not part of the client API.
revoke all on function public.url_host(text), public.host_matches_domains(text, text[]) from public, anon, authenticated;
revoke all on function public.set_updated_at(), public.enforce_apply_url_allow_list(), public.enforce_domains_cover_apply_urls() from public, anon, authenticated;
