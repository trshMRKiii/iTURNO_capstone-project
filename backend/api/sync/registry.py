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
    RemittanceBatch, Deposit, Collection, AuditLog,
    User, Route, TicketPrice, TerminalPrice, TicketForm, PUVType,
)

PUSH_MODELS = [
    Vehicle, Driver, Ticket, TicketSeries, Requisition,
    RemittanceBatch, Deposit, Collection, AuditLog,
]

PULL_MODELS = [
    User, Route, TicketPrice, TerminalPrice, TicketForm, PUVType,
]
