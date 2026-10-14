"""Ways to hold syncing off: the SYNC_ENABLED switch, and a temporary restore flag.

SYNC_ENABLED lives in backend/.env and is re-read on every call, so flipping it
takes effect on the running worker and server without a restart. While it is
off, nothing talks to Supabase; local changes keep queuing and push once it is
turned back on.

The restore flag is a file, because the worker is a separate process from the
web server. It is removed when the restore ends (success or failure); a flag
older than STALE_AFTER_SECONDS is ignored, so a crash mid-restore can't leave
sync paused forever.
"""
import contextlib
import os
import time

from django.conf import settings
from dotenv import dotenv_values

FLAG_PATH = settings.BASE_DIR / "backup" / ".sync_paused"
STALE_AFTER_SECONDS = 30 * 60


def sync_enabled():
    value = dotenv_values(settings.BASE_DIR / ".env").get("SYNC_ENABLED") or os.getenv("SYNC_ENABLED", "True")
    return value.strip().lower() == "true"


def is_paused():
    if not sync_enabled():
        return True
    try:
        return time.time() - os.path.getmtime(FLAG_PATH) < STALE_AFTER_SECONDS
    except OSError:
        return False


@contextlib.contextmanager
def paused():
    FLAG_PATH.parent.mkdir(exist_ok=True)
    FLAG_PATH.touch()
    try:
        yield
    finally:
        FLAG_PATH.unlink(missing_ok=True)
