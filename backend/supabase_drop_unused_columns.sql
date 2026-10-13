-- Mirrors Django migration 0078_drop_unused_columns_and_roaminglog on the Supabase side.
-- Run in the Supabase SQL editor BEFORE the LAN sync worker / Vercel deploy that carries
-- this change: the dropped columns are NOT NULL there (Django emits them without defaults),
-- so pushes that omit them would be rejected until they are removed.
-- Safe to re-run (IF EXISTS everywhere).

begin;

alter table api_backfillrecord  drop column if exists source;
alter table api_remittancebatch drop column if exists status;
alter table api_ticket          drop column if exists nullified_at;
alter table api_ticket          drop column if exists reason;
alter table api_ticketseries    drop column if exists beginning_balance;
alter table api_ticketseries    drop column if exists beginning_balance_date;
alter table api_ticketseries    drop column if exists pad_no;
alter table api_ticketseries    drop column if exists box_no;

drop table if exists api_roaminglog;

commit;
