-- For the System and Payments pages: a log of scheduled job runs, and a "refunded" payment status.

create table public.cron_run (
  id bigint generated always as identity primary key,
  job text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  summary jsonb not null default '{}'::jsonb
);
create index cron_run_job_started on public.cron_run (job, started_at desc);
comment on table public.cron_run is 'One row per scheduled job run, with what it did.';
alter table public.cron_run enable row level security;
revoke all on public.cron_run from anon, authenticated;
grant all on public.cron_run to service_role;

alter table public.payment drop constraint payment_status_check;
alter table public.payment add constraint payment_status_check
  check (status in ('pending', 'paid', 'failed', 'refunded'));
alter table public.payment add column refunded_at timestamptz;
