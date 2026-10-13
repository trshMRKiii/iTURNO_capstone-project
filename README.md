# iTURNO User Manual

iTURNO is a fare-ticketing and fleet-operations management system for Public
Utility Vehicles (PUVs, e.g. jeepneys) operating on routes terminating in San
Fernando, La Union. It digitizes terminal operations: issuing tickets as
vehicles queue/dispatch, tracking cash collection, reconciling remittances,
and syncing records to the cloud for remote (off-LAN) access.

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Getting Started](#getting-started)
3. [User Roles](#user-roles)
4. [Dashboard Modules](#dashboard-modules)
5. [Core Workflows](#core-workflows)
6. [LAN + Remote Architecture](#lan--remote-architecture)
7. [Project Structure](#project-structure)

## Tech Stack

**Frontend**
- React 19 + Vite 8 (dev server / build tool)
- React Router v7
- Tailwind CSS v4
- Recharts (charts/analytics)
- html5-qrcode, jsqr, qrcode.react (QR scanning & generation for tickets)
- exceljs (remittance/report exports)
- @supabase/supabase-js (used only in the Vercel remote layer, not the LAN frontend directly)
- date-fns, uuid, select-philippines-address

**Backend (LAN)**
- Django 6.0.6 + Django REST Framework
- djangorestframework-simplejwt (JWT auth) + Django session auth
- django-cors-headers
- Channels + Daphne (WebSockets, e.g. live queue updates)
- psycopg (PostgreSQL driver, used by the Supabase sync engine)
- SQLite (`backend/db.sqlite3` for local/test runs, `backend/db_production.sqlite3` when `DEBUG=False`)

**Remote (Vercel)**
- Node serverless functions under `api/remote/` reusing the same `api_user`
  accounts, backed by Supabase (PostgreSQL) as the remote data mirror
- jsonwebtoken, nodemailer (password reset email)

## Getting Started

### Backend

```bash
cd backend
python -m venv venv               # optional but recommended
venv\Scripts\activate              # Windows (use `source venv/bin/activate` on macOS/Linux)
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

The Django server defaults to `http://localhost:8000`. CORS/CSRF is
pre-configured to trust `localhost:3000`, `5173`, and `5174`
(`backend/backend/settings.py`), matching common Vite dev ports.

Copy `backend/.env.example` to `backend/.env` and fill in the values.
`DEBUG=True` (default) uses `db.sqlite3` and never pushes data to Supabase;
`DEBUG=False` uses `db_production.sqlite3` and enables the real sync worker.
To keep the Supabase mirror (used by the remote/Vercel deployment) up to
date, run the sync worker alongside the server:

```bash
python manage.py sync_worker
```

### Frontend

```bash
npm install
npm run dev       # start Vite dev server
npm run build     # production build
npm run lint      # run ESLint
```

## User Roles

Accounts are stored in a single `User` model (`backend/api/models.py`) with a
`role` field:

| Role         | Typical Use                                                             |
| ------------ | ------------------------------------------------------------------------ |
| PERSONNEL    | Front-line terminal staff (default role); Fleet & Driver only when ticked |
| SUPERVISOR   | Same position as Manager: all modules, ticks Personnel fleet access       |
| MANAGER      | Same position as Supervisor (different title)                            |
| SUPERADMIN   | Full system access, including settings and remote (Vercel) admin edits   |

## Dashboard Modules

All modules live under `src/app/dashboard/`, listed in the order they appear
in the sidebar:

- **Ticket Requisition** (`requisition/`) — Manage ticket stock: requisitions,
  ticket series, and pricing.
- **Queue Management** (`queue/`) — Issue tickets to vehicles/drivers as they
  queue, track ticket/queue status, and manage per-route ticket pricing.
- **Dispatch** (`dispatch/`) — Track vehicle dispatch out of the terminal
  (live-updated over WebSockets).
- **Transaction** (`collection/`) — Record cash collected from tickets sold.
- **Remittance** (`remittance/`) — Review and export remittance batches
  (bills/coins deposits reconciled against collections).
- **Fleet & Driver** (`registry/`) — Combined registry for vehicles (status,
  active driver assignment, archiving) and driver profiles (status, photo,
  barangay address, archiving).
- **User Management** (`user/`) — Manage staff accounts and roles.
- **Reports** (`report/`) — Reporting and analytics: fleet, collections,
  remittance, EOD reconciliation, queue/roaming logs, and audit trail tables.
- **Settings** (`settings/`) — Configure ticket pricing, terminal price,
  routes/PUV types, and the ticket backfill tool (`settings/backfill/`, for
  retroactively entering physically-issued tickets that missed live entry).

## Core Workflows

Ordered to mirror the [Dashboard Modules](#dashboard-modules) list above.

### 1. Requisition & Ticket Stock
Ticket series/forms are requisitioned and priced, tracking inventory of
physical ticket stock issued to the terminal.

### 2. Queue & Ticketing
A vehicle queues at the terminal → staff issues a ticket tied to the
vehicle, driver, and route → ticket can be verified, dispatched, or
cancelled. Missed physical tickets can be entered retroactively via the
Settings backfill tool.

### 3. Dispatch
Queued and ticketed vehicles are tracked as they dispatch out of the
terminal, with live status updates pushed over WebSockets.

### 4. Collection & Remittance
Cash collected from issued tickets is recorded as a `Collection` →
collections are grouped into a `RemittanceBatch` alongside cash `Deposit`
records (bills and coins) → batches are reviewed and exported as reports.

### 5. Reporting
Aggregated views of fleet, collections, remittances, queue/roaming activity,
and audit trail are available in the Report module, with export utilities
for remittance and reconciliation reports.

## LAN + Remote Architecture

iTURNO runs as a LAN-first system with an optional cloud mirror for remote
access before/after deploying the frontend to Vercel:

- **LAN (source of truth for live transactions):** the Django + SQLite
  backend handles all real-time ticketing, dispatch, and collection
  operations (`backend/api/models.py`).
- **Sync engine** (`backend/api/sync/`): one-directional interval syncs keep
  a Supabase (PostgreSQL) mirror up to date — `push.py` sends new/changed
  transactional rows (Vehicle, Driver, Ticket, Requisition, RemittanceBatch,
  Deposit, Collection, AuditLog, etc.) via an outbox (`SyncQueue`), and
  `pull.py` pulls back admin-edited reference data (Users, Routes, pricing).
  Run via `python manage.py sync_once` (one cycle) or `sync_worker`
  (continuous, interval set by `SYNC_INTERVAL_SECONDS`).
- **Remote (Vercel):** serverless functions under `api/remote/` provide
  login and admin editing against the Supabase mirror when the frontend is
  deployed off-LAN (`VITE_API_MODE=remote`). Transactional modules are
  view-only remotely; Route/User/Settings/Staff/Vehicle-Driver registry
  fields support remote edits reserved for SUPERADMIN.

## Project Structure

```
backend/
    api/
        models.py                    # Driver, Vehicle, Route, Ticket, Requisition,
                                      # TicketSeries, TicketForm, TicketPrice, PUVType,
                                      # TerminalPrice, WipMode, RemittanceBatch, Deposit,
                                      # Collection, AuditLog, BackupRecord, BackfillRecord,
                                      # SyncQueue, RemoteBackfillRequest
        views/                        # API endpoints (viewsets, records, reports, backfill, auth)
        sync/                         # Supabase push/pull sync engine
        management/commands/         # sync_worker, seed_supabase, backfill_driver_qr, etc.
        migrations/
    backend/
        settings.py                   # Django settings (CORS, JWT, DB, sync interval)
    manage.py

api/                                  # Vercel serverless functions (remote deployment)
    _lib/                              # auth, mailer, shapes, dateRange, Supabase admin client
    remote/                            # auth, registry, reports, resource, settings endpoints

src/
    app/dashboard/                    # One folder per dashboard module (see above)
    lib/                              # Shared hooks and API service (LAN/remote switch)
    styles/                           # Per-module CSS
```
