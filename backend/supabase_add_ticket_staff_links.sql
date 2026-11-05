-- Mirrors Django migration 0094_ticket_checked_by_users on the Supabase side.
-- Run in the Supabase SQL editor BEFORE the LAN sync worker / Vercel deploy that carries
-- this change: ticket pushes now include these columns, and would be rejected without them.
-- Nullable, so older rows are fine. Safe to re-run (IF NOT EXISTS everywhere).

begin;

alter table api_ticket add column if not exists checked_in_by_id  bigint references api_user(id) on delete set null;
alter table api_ticket add column if not exists checked_out_by_id bigint references api_user(id) on delete set null;

create index if not exists api_ticket_checked_in_by_id_idx  on api_ticket (checked_in_by_id);
create index if not exists api_ticket_checked_out_by_id_idx on api_ticket (checked_out_by_id);

-- Link tickets that predate the columns, only where exactly one account has that display name.
with names as (
  select id, coalesce(nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), ''), username) as name
  from api_user
), unique_names as (
  select name, min(id) as id from names group by name having count(*) = 1
)
update api_ticket t set checked_in_by_id = u.id
from unique_names u where t.checked_in_by_id is null and t.checked_in_by_name = u.name;

with names as (
  select id, coalesce(nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), ''), username) as name
  from api_user
), unique_names as (
  select name, min(id) as id from names group by name having count(*) = 1
)
update api_ticket t set checked_out_by_id = u.id
from unique_names u where t.checked_out_by_id is null and t.checked_out_by_name = u.name;

commit;
