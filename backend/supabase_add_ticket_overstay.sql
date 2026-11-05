-- Mirrors the Django migration that adds Ticket.overstay_minutes on the Supabase side.
-- Run in the Supabase SQL editor BEFORE the LAN sync worker / Vercel deploy that carries
-- this change: ticket pushes now include this column, and would be rejected without it.
-- Safe to re-run.

alter table api_ticket add column if not exists overstay_minutes integer not null default 0;
create index if not exists api_ticket_overstay_minutes_idx on api_ticket (overstay_minutes);
