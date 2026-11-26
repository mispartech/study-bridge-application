-- Goals and pathways (docs/CANADA_V1_PLAN.md, step B). A student ticks what they want after studying; each
-- pathway says how much each matching signal counts for that goal. Admins manage both in the console, so no
-- goal is hard-coded in the scorer. Signals are computed only from reviewed data, per country (UK, Canada,
-- and any destination added later), so the same pathway works for every route.
-- Additive only (decision D6): new tables and one new column with a default.

create table public.pathway (
  key text primary key check (key ~ '^[a-z][a-z_]{1,39}$'),
  label text not null check (char_length(label) between 2 and 60),
  description text not null default '' check (char_length(description) <= 280),
  active boolean not null default true,
  sort_order int not null default 0,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
comment on table public.pathway is 'Goals a student can choose (study only, corporate, business...). Managed in the admin.';

-- The signals the scorer understands (lib/match/pathways.ts). Adding one needs code too, so the list is checked here.
create table public.pathway_signal (
  pathway_key text not null references public.pathway (key) on delete cascade on update cascade,
  signal text not null check (signal in (
    'field_match', 'placement', 'post_study_work', 'funding', 'work_permit_route',
    'in_demand', 'licensing_path', 'research', 'entrepreneurship'
  )),
  weight int not null check (weight between 0 and 100),
  primary key (pathway_key, signal)
);
comment on table public.pathway_signal is 'How much each signal counts for a pathway (0-100). Managed in the admin.';

alter table public.pathway enable row level security;
alter table public.pathway_signal enable row level security;
revoke all on public.pathway, public.pathway_signal from anon, authenticated;
grant select, insert, update, delete on public.pathway, public.pathway_signal to service_role;

alter table public.student_profile add column goals text[] not null default '{}';
comment on column public.student_profile.goals is 'Pathway keys the student chose. Unknown or inactive keys are ignored.';

-- Starting pathways. Plain data: admins rename, reweight, add or switch them off in the console.
insert into public.pathway (key, label, description, sort_order) values
  ('study_only', 'Get the degree', 'The qualification is the goal: the right course at the right price.', 10),
  ('corporate', 'Build a corporate career', 'Work for an employer after graduating and climb from there.', 20),
  ('business', 'Start a business', 'Build something of your own during or after your studies.', 30),
  ('academic', 'Academic or research career', 'Go on to research, a doctorate or teaching at a university.', 40),
  ('licensed', 'A licensed profession', 'Practise a regulated profession such as accounting, nursing or engineering.', 50);

insert into public.pathway_signal (pathway_key, signal, weight) values
  ('study_only', 'field_match', 70), ('study_only', 'funding', 20), ('study_only', 'placement', 10),
  ('corporate', 'field_match', 40), ('corporate', 'placement', 25), ('corporate', 'post_study_work', 20),
  ('corporate', 'work_permit_route', 10), ('corporate', 'in_demand', 5),
  ('business', 'field_match', 30), ('business', 'entrepreneurship', 30), ('business', 'post_study_work', 20),
  ('business', 'placement', 10), ('business', 'funding', 10),
  ('academic', 'field_match', 45), ('academic', 'research', 35), ('academic', 'funding', 20),
  ('licensed', 'field_match', 40), ('licensed', 'licensing_path', 35), ('licensed', 'post_study_work', 15),
  ('licensed', 'placement', 10);
