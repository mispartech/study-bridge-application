-- Publish the new requirement fields, and record which fields the reviewer changed.

drop function public.publish_review_item(uuid, uuid, jsonb, jsonb, jsonb, jsonb, jsonb);

create function public.publish_review_item(
  p_review_id uuid,
  p_reviewer uuid,
  p_university jsonb,
  p_programme jsonb,
  p_requirement jsonb,
  p_intakes jsonb,
  p_fees jsonb,
  p_field_changes text[]
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_item public.review_queue%rowtype;
  v_university uuid;
  v_programme uuid;
  v_now timestamptz := now();
  v_row jsonb;
begin
  select * into v_item from public.review_queue where id = p_review_id for update;
  if not found then raise exception 'Review item not found'; end if;
  if v_item.status <> 'pending' then raise exception 'Review item already handled'; end if;

  select u.id into v_university from public.university u
  where not u.is_demo and u.official_domains && array(select jsonb_array_elements_text(p_university->'official_domains'))
  limit 1;
  if v_university is null then
    insert into public.university (name, country, city, region, is_public, dli_number, sponsor_licence,
      sevp_certified, intl_office_url, official_domains, source_url, last_verified_at, confidence)
    values (p_university->>'name', (p_university->>'country')::public.country_code, p_university->>'city',
      p_university->>'region', (p_university->>'is_public')::boolean, p_university->>'dli_number',
      coalesce((p_university->>'sponsor_licence')::boolean, false),
      coalesce((p_university->>'sevp_certified')::boolean, false), p_university->>'intl_office_url',
      array(select jsonb_array_elements_text(p_university->'official_domains')), p_university->>'source_url',
      v_now, (p_university->>'confidence')::public.confidence_level)
    returning id into v_university;
  end if;

  v_programme := v_item.record_id;
  if v_programme is null then
    insert into public.programme (university_id, title, degree_type, field, duration_months, study_mode,
      stem_designated, has_coop_or_placement, description, programme_url, apply_url, source_url,
      last_verified_at, confidence)
    values (v_university, p_programme->>'title', (p_programme->>'degree_type')::public.degree_type,
      (p_programme->>'field')::public.field_code, (p_programme->>'duration_months')::int,
      (p_programme->>'study_mode')::public.study_mode, (p_programme->>'stem_designated')::boolean,
      (p_programme->>'has_coop_or_placement')::boolean, coalesce(p_programme->>'description', ''),
      p_programme->>'programme_url', p_programme->>'apply_url', p_programme->>'source_url', v_now,
      (p_programme->>'confidence')::public.confidence_level)
    returning id into v_programme;
  else
    update public.programme set title = p_programme->>'title',
      degree_type = (p_programme->>'degree_type')::public.degree_type,
      field = (p_programme->>'field')::public.field_code,
      duration_months = (p_programme->>'duration_months')::int,
      study_mode = (p_programme->>'study_mode')::public.study_mode,
      stem_designated = (p_programme->>'stem_designated')::boolean,
      has_coop_or_placement = (p_programme->>'has_coop_or_placement')::boolean,
      description = coalesce(p_programme->>'description', ''), programme_url = p_programme->>'programme_url',
      apply_url = p_programme->>'apply_url', source_url = p_programme->>'source_url',
      last_verified_at = v_now, confidence = (p_programme->>'confidence')::public.confidence_level
    where id = v_programme;
  end if;

  delete from public.requirement where programme_id = v_programme;
  insert into public.requirement (programme_id, min_uk_class, min_gpa4, nigeria_rule,
    considers_lower_with_experience, ielts_min, duolingo_min, pte_min, toefl_entries, english_waiver_text,
    waec_english_accepted, waec_min_grade, gre_status, gmat_status, min_work_years, documents,
    requires_professional_registration, leads_to_registration, clinical_placement, open_to_international,
    checks_required, source_url, last_verified_at, confidence)
  values (v_programme, (p_requirement->>'min_uk_class')::public.uk_class_band,
    (p_requirement->>'min_gpa4')::numeric, p_requirement->>'nigeria_rule',
    coalesce((p_requirement->>'considers_lower_with_experience')::boolean, false),
    (p_requirement->>'ielts_min')::numeric, (p_requirement->>'duolingo_min')::numeric,
    (p_requirement->>'pte_min')::numeric, coalesce(p_requirement->'toefl_entries', '[]'::jsonb),
    p_requirement->>'english_waiver_text', coalesce((p_requirement->>'waec_english_accepted')::boolean, false),
    p_requirement->>'waec_min_grade', (p_requirement->>'gre_status')::public.test_status,
    (p_requirement->>'gmat_status')::public.test_status, coalesce((p_requirement->>'min_work_years')::numeric, 0),
    array(select jsonb_array_elements_text(coalesce(p_requirement->'documents', '[]'::jsonb))),
    coalesce(p_requirement->>'requires_professional_registration', 'none'), p_requirement->>'leads_to_registration',
    coalesce((p_requirement->>'clinical_placement')::boolean, false), p_requirement->>'open_to_international',
    array(select jsonb_array_elements_text(coalesce(p_requirement->'checks_required', '[]'::jsonb))),
    p_requirement->>'source_url', v_now, (p_requirement->>'confidence')::public.confidence_level);

  delete from public.intake where programme_id = v_programme;
  for v_row in select * from jsonb_array_elements(p_intakes) loop
    insert into public.intake (programme_id, start_term, cycle, start_month, application_opens, deadlines,
      source_url, last_verified_at, confidence)
    values (v_programme, (v_row->>'start_term')::public.intake_term, v_row->>'cycle',
      (v_row->>'start_month')::date, (v_row->>'application_opens')::date, coalesce(v_row->'deadlines', '[]'::jsonb),
      v_row->>'source_url', v_now, (v_row->>'confidence')::public.confidence_level);
  end loop;

  delete from public.fee where programme_id = v_programme;
  for v_row in select * from jsonb_array_elements(p_fees) loop
    insert into public.fee (programme_id, fee_year, tuition_per_year_minor, application_fee_minor, currency,
      source_url, last_verified_at, confidence)
    values (v_programme, v_row->>'fee_year', (v_row->>'tuition_per_year_minor')::bigint,
      coalesce((v_row->>'application_fee_minor')::bigint, 0), (v_row->>'currency')::public.currency_code,
      v_row->>'source_url', v_now, (v_row->>'confidence')::public.confidence_level);
  end loop;

  update public.review_queue set status = 'approved', reviewed_by = p_reviewer, reviewed_at = v_now,
    published_programme_id = v_programme, field_changes = p_field_changes where id = p_review_id;
  return v_programme;
end $$;
revoke all on function public.publish_review_item(uuid, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, text[])
  from public, anon, authenticated;
grant execute on function public.publish_review_item(uuid, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, text[])
  to service_role;
