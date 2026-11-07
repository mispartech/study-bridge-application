-- Review records can be about any content table (fees, intakes, city costs, programmes), so the
-- table_name check added during development is removed.
alter table public.review_queue drop constraint if exists review_queue_table_name_check;
