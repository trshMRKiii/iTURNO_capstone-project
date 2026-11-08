-- Mirrors the Django migration that lets a queued Ticket have no driver yet (kiosk
-- "Unregistered driver" check-in) on the Supabase side.
-- Run in the Supabase SQL editor BEFORE the LAN sync worker / Vercel deploy that carries
-- this change: ticket pushes can now send a null driver_id, and would be rejected without it.
-- Safe to re-run.

alter table api_ticket alter column driver_id drop not null;
