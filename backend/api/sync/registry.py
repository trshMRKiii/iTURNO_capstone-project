"""Single source of truth for which models sync in which direction.

PUSH_MODELS: LAN is authoritative. Created/edited locally at the terminal,
mirrored out to Supabase for read-only remote viewing. Add a model here and
it's automatically queued on every save — see signals.py.

PULL_MODELS: Supabase is authoritative. Edited remotely by admin/manager,
pulled down and cached locally so the LAN keeps working off the last-known
values if the internet drops. These tables are small, so pull does a full
fetch each cycle rather than tracking deltas.

To extend either list, just add the model here — nothing else needs to
change.
"""
from api.models import (
    Vehicle, Driver, Ticket, TicketSeries, Requisition,
    RemittanceBatch, Deposit, Collection, AuditLog, WipMode,
    User, Route, TicketPrice, TerminalPrice, TicketForm, PUVType,
)

# WipMode is pushed for remote *display* only (gates the remote backfill UI) —
# the LAN-side issuance block itself always reads it locally, never through
# Supabase, so push latency here doesn't affect that. RemoteBackfillRequest
# isn't listed here or in PULL_MODELS: the remote endpoint writes PENDING rows
# straight to Supabase itself, and api/sync/apply_remote_backfill.py applies
# them with custom logic (not a plain mirror), so it doesn't fit either list's
# generic push/pull semantics.
PUSH_MODELS = [
    Vehicle, Driver, Ticket, TicketSeries, Requisition,
    RemittanceBatch, Deposit, Collection, AuditLog, WipMode,
]

PULL_MODELS = [
    User, Route, TicketPrice, TerminalPrice, TicketForm, PUVType,
]
