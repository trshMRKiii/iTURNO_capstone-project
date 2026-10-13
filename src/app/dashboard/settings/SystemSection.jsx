import React, { useEffect, useRef, useState } from "react";
import {
  DataTable, Toolbar, SearchInput, StatusBadge, IconButton, Pagination, SectionHeader, Card, SegmentedControl,
  Dialog, ActionButton, ProgressDialog, useFeedback, PlusIcon, UploadIcon, DownloadIcon, RestoreIcon, TrashIcon, WarningIcon, FileIcon, CheckIcon, CloseIcon,
} from "../../../components/ui/kit";

const PAGE_SIZE = 10;

const formatBytes = (bytes) => {
  if (!bytes) return "0 KB";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
};

const formatDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const formatTime = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const formatShort = (iso) => `${new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${formatTime(iso)}`;
const formatLong = (d) => `${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}, ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;

// Backup files are named backup_YYYYMMDD_HHMMSS.json; fall back to the file's modified time.
const backupDateOf = (file) => {
  const m = /backup_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/.exec(file.name);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : new Date(file.lastModified);
};

// Client-side sanity check only: a backup is a Django dumpdata JSON array of { model, fields } records.
const checkBackupFile = async (file) => {
  try {
    const data = JSON.parse(await file.text());
    const ok = Array.isArray(data) && data.length > 0 && data.slice(0, 20).every((r) => r && typeof r.model === "string" && r.fields);
    return ok ? { valid: true } : { valid: false, message: "This does not look like a system backup" };
  } catch {
    return { valid: false, message: "This file is not valid JSON" };
  }
};

const ROLLBACK_PHRASE = "ROLL BACK";

// Steps shown while a long operation runs. The server does the snapshot and the data swap in a
// single request, so the first two steps advance on a short timer; the last one is real: it
// starts when the request has finished and only the backups list is left to refresh.
const RESTORE_STEPS = [
  { label: "Saving safety snapshot", doneLabel: "Safety snapshot saved" },
  { label: "Replacing data", doneLabel: "Data replaced" },
  { label: "Finishing up" },
];
const CREATE_STEPS = [
  { label: "Collecting records", doneLabel: "Records collected" },
  { label: "Saving backup file", doneLabel: "Backup file saved" },
  { label: "Finishing up" },
];
const STEP_MS = 1400;

// Presentational only: backups, form state and every handler come from settings.jsx.
function SystemSection({
  backups, loading, rowStates, label, onLabelChange, onCreate,
  onRestoreFile,
  onDownload, onRollback, onDelete,
}) {
  const { report } = useFeedback();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [page, setPage] = useState(1);

  // Row overflow menu (Download / Delete), positioned from the clicked button
  const [menu, setMenu] = useState(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e) => e.key === "Escape" && close();
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  // Roll back dialog
  const [rollbackTarget, setRollbackTarget] = useState(null);
  const [phrase, setPhrase] = useState("");
  // Restore-from-file drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [picked, setPicked] = useState(null); // { file, checking?, valid?, message? }
  const [understood, setUnderstood] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  // Long operation in progress: { title, steps, active } blocks the page until it finishes.
  const [progress, setProgress] = useState(null);
  const timerRef = useRef(null);
  useEffect(() => () => clearInterval(timerRef.current), []);

  const runLong = async (title, steps, run, retry) => {
    setProgress({ title, steps, active: 0 });
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setProgress((p) => (p && p.active < steps.length - 2 ? { ...p, active: p.active + 1 } : p));
    }, STEP_MS);
    const outcome = await run(() => setProgress((p) => (p ? { ...p, active: steps.length - 1 } : p)));
    clearInterval(timerRef.current);
    setProgress(null);
    if (outcome?.error && retry) outcome.error.onRetry = retry;
    report(outcome);
  };

  const closeRollback = () => { setRollbackTarget(null); setPhrase(""); };
  const closeDrawer = () => { setDrawerOpen(false); setPicked(null); setUnderstood(false); setDragOver(false); };

  const startRollback = (backup) => runLong(
    "Restoring backup...", RESTORE_STEPS, (onStage) => onRollback(backup, onStage), () => startRollback(backup),
  );

  const confirmRollback = () => {
    const target = rollbackTarget;
    closeRollback();
    startRollback(target);
  };

  const startCreate = () => runLong("Creating backup...", CREATE_STEPS, (onStage) => onCreate(onStage), startCreate);

  const pickFile = async (file) => {
    if (!file) return;
    setUnderstood(false);
    setPicked({ file, checking: true });
    setPicked({ file, ...(await checkBackupFile(file)) });
  };

  const startRestoreFile = (file) => runLong(
    "Restoring backup...", RESTORE_STEPS, (onStage) => onRestoreFile(file, onStage), () => startRestoreFile(file),
  );

  const confirmRestore = () => {
    const file = picked.file;
    closeDrawer();
    startRestoreFile(file);
  };

  const latestId = backups[0]?.id; // the API returns newest first

  const q = search.trim().toLowerCase();
  const localDay = (iso) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  // search + date narrow the list first, so the tab counts reflect them too
  const narrowed = backups.filter((b) => {
    if (q && !`${b.label} ${b.filename} ${b.created_by_name || ""}`.toLowerCase().includes(q)) return false;
    if (dateFilter && localDay(b.created_at) !== dateFilter) return false;
    return true;
  });
  const manual = narrowed.filter((b) => b.source !== "AUTO");
  const auto = narrowed.filter((b) => b.source === "AUTO");
  const matches = filter === "manual" ? manual : filter === "auto" ? auto : narrowed;
  const pageCount = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const rows = matches.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const totalBytes = matches.reduce((n, b) => n + (b.size_bytes || 0), 0);

  const columns = [
    {
      key: "backup",
      header: "Backup",
      render: (b) => (
        <div className="ui-cell-stack">
          <span className="ui-title-row">
            {b.label || b.filename}
            {b.id === latestId && <StatusBadge tone="success" dot={false}><span className="ui-badge--sm">Latest</span></StatusBadge>}
          </span>
          <span className="ui-cell-sub">
            {b.label ? b.filename : ""}
            {b.source !== "AUTO" && b.created_by_name ? `${b.label ? " · " : ""}by ${b.created_by_name}` : ""}
          </span>
        </div>
      ),
    },
    {
      key: "source",
      header: "Source",
      render: (b) => (b.source === "AUTO"
        ? <StatusBadge tone="info" dot={false}>Auto &middot; pre-restore</StatusBadge>
        : <StatusBadge tone="neutral" dot={false}>Manual</StatusBadge>),
    },
    { key: "size", header: "Size", align: "right", render: (b) => formatBytes(b.size_bytes) },
    {
      key: "created",
      header: "Created",
      render: (b) => (
        <div className="ui-cell-stack">
          <span>{formatDate(b.created_at)}</span>
          <span className="ui-cell-sub">{formatTime(b.created_at)}</span>
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (b) => {
        const name = b.label || b.filename;
        return (
          <div className="ui-cell-actions">
            <IconButton icon={<RestoreIcon />} text="Roll back" label={`Roll back to ${name}`} onClick={() => setRollbackTarget(b)} />
            <button
              type="button"
              className={`ui-more-btn${menu?.backup.id === b.id ? " is-open" : ""}`}
              aria-label={`More actions for ${name}`}
              aria-haspopup="menu"
              aria-expanded={menu?.backup.id === b.id}
              onClick={(e) => {
                e.stopPropagation();
                if (menu?.backup.id === b.id) return setMenu(null);
                const r = e.currentTarget.getBoundingClientRect();
                setMenu({ backup: b, top: r.bottom + 4, right: window.innerWidth - r.right });
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      {menu && (
        <div
          className="ui-row-menu"
          role="menu"
          style={{ top: menu.top, right: menu.right }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className="ui-row-menu-item"
            onClick={() => { onDownload(menu.backup); setMenu(null); }}
          >
            <DownloadIcon /> Download
          </button>
          <button
            type="button"
            role="menuitem"
            className="ui-row-menu-item ui-row-menu-item--danger"
            onClick={() => { onDelete(menu.backup); setMenu(null); }}
          >
            <TrashIcon /> Delete
          </button>
        </div>
      )}
      <SectionHeader
        title="Backups & restore"
      />

      <div className="ui-card-row">
        <Card title="Create a backup" description="Good before big changes, like a payroll run or a fare update.">
          <label className="ui-field-label" htmlFor="backup-label">Label <span>(optional)</span></label>
          <div className="ui-inline-form">
            <input
              id="backup-label"
              className="ui-text-input"
              type="text"
              value={label}
              onChange={(e) => onLabelChange(e.target.value)}
              placeholder="e.g. Before July payroll run"
            />
            <ActionButton variant="primary" icon={<PlusIcon />} onClick={startCreate}>Create backup</ActionButton>
          </div>
        </Card>

        <Card title="Restore from a file" description="Upload a backup you downloaded earlier.">
          <button type="button" className="ui-outline-btn" onClick={() => setDrawerOpen(true)}>
            <UploadIcon />
            Choose backup file
          </button>
        </Card>
      </div>

      <DataTable
        toolbar={
          <Toolbar>
            <h3 className="ui-toolbar-title">Saved backups</h3>
            <SegmentedControl
              label="Backup source"
              value={filter}
              onChange={(k) => { setFilter(k); setPage(1); }}
              options={[
                { key: "all", label: "All", count: narrowed.length },
                { key: "manual", label: "Manual", count: manual.length },
                { key: "auto", label: "Automatic", count: auto.length },
              ]}
            />
            <span className="ui-toolbar-spacer" />
            <div className="ui-date-range">
              <input
                type="date"
                className="ui-text-input ui-date-input"
                aria-label="Filter by date created"
                value={dateFilter}
                onChange={(e) => { setDateFilter(e.target.value); setPage(1); }}
              />
              {dateFilter && (
                <button type="button" className="ui-outline-btn" onClick={() => { setDateFilter(""); setPage(1); }}>Clear</button>
              )}
            </div>
            <SearchInput className="ui-search--fixed" value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search backups" />
          </Toolbar>
        }
        columns={columns}
        rows={rows}
        loading={loading}
        rowState={(b) => rowStates[b.id]}
        rowKey={(b) => b.id}
        emptyMessage={backups.length === 0 ? "No backups yet" : "No matches found"}
        footer={
          <>
            <span>Showing {loading ? 0 : rows.length} of {loading ? 0 : matches.length} backups &middot; {formatBytes(totalBytes)} total</span>
            {pageCount > 1 && <Pagination page={current} pageCount={pageCount} onPage={setPage} />}
          </>
        }
      />

      <Dialog
        open={!!rollbackTarget}
        onClose={closeRollback}
        title="Roll back to this backup?"
        footer={
          <>
            <button type="button" className="ui-outline-btn ui-outline-btn--auto" onClick={closeRollback}>Cancel</button>
            <button
              type="button"
              className="ui-danger-btn"
              onClick={confirmRollback}
              disabled={phrase.trim().toUpperCase() !== ROLLBACK_PHRASE}
            >
              Roll back
            </button>
          </>
        }
      >
        {rollbackTarget && (
          <>
            <div className="ui-summary">
              <div className="ui-cell-stack">
                <span className="ui-summary-title">{rollbackTarget.label || rollbackTarget.filename}</span>
                <span className="ui-cell-sub">{formatLong(new Date(rollbackTarget.created_at))} &middot; {formatBytes(rollbackTarget.size_bytes)}</span>
              </div>
              <StatusBadge tone={rollbackTarget.source === "AUTO" ? "info" : "neutral"} dot={false}>
                {rollbackTarget.source === "AUTO" ? "Auto · pre-restore" : "Manual"}
              </StatusBadge>
            </div>
            <p className="ui-eyebrow">What happens</p>
            <ol className="ui-steps">
              <li className="ui-step">
                <span className="ui-step-num">1</span>
                <span>A safety snapshot of your current data is saved first.</span>
              </li>
              <li className="ui-step">
                <span className="ui-step-num ui-step-num--danger">2</span>
                <span>
                  All current data is replaced with this backup. Anything recorded after{" "}
                  <strong>{formatShort(rollbackTarget.created_at)}</strong> will be gone, but it stays in the safety snapshot.
                </span>
              </li>
            </ol>
            <label className="ui-field-label" htmlFor="rollback-confirm">
              Type <span className="ui-code">{ROLLBACK_PHRASE}</span> to confirm
            </label>
            <input
              id="rollback-confirm"
              className="ui-text-input ui-text-input--danger"
              style={{ width: "100%" }}
              type="text"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              autoComplete="off"
              autoFocus
            />
          </>
        )}
      </Dialog>

      <Dialog
        open={drawerOpen}
        onClose={closeDrawer}
        placement="drawer"
        title="Restore from file"
        subtitle="Upload a backup file you downloaded from this system."
        footer={
          <>
            <button type="button" className="ui-outline-btn ui-outline-btn--auto" onClick={closeDrawer}>Cancel</button>
            <button type="button" className="ui-danger-btn" onClick={confirmRestore} disabled={!picked?.valid || !understood}>
              Restore backup
            </button>
          </>
        }
      >
        <p className="ui-eyebrow">Step 1 &middot; Choose a file</p>
        <div
          className={`ui-dropzone${dragOver ? " ui-dropzone--over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files?.[0]); }}
        >
          <UploadIcon size={20} />
          <span>
            <button type="button" className="ui-dropzone-link" onClick={() => inputRef.current?.click()}>Browse</button> or drag a file here
          </span>
          <span className="ui-hint">.json backup files only</span>
          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }}
          />
        </div>

        {picked && (
          <div className={`ui-file-card${picked.valid === false ? " ui-file-card--invalid" : ""}`}>
            <span className="ui-file-icon"><FileIcon /></span>
            <div className="ui-file-meta">
              <div className="ui-file-name">{picked.file.name}</div>
              <div className="ui-file-status">
                {picked.checking && "Checking file..."}
                {picked.valid && (
                  <><CheckIcon /> Valid backup &middot; {formatBytes(picked.file.size)} &middot; from {formatLong(backupDateOf(picked.file))}</>
                )}
                {picked.valid === false && picked.message}
              </div>
            </div>
            <button type="button" className="ui-dialog-x" onClick={() => { setPicked(null); setUnderstood(false); }} aria-label="Remove file">
              <CloseIcon size={16} />
            </button>
          </div>
        )}

        <p className="ui-eyebrow">Step 2 &middot; Confirm</p>
        <div className="ui-notice">
          <WarningIcon size={18} />
          <div>
            <div className="ui-notice-title">This replaces all current data</div>
            <p>A safety snapshot is saved first, so you can undo this from the backups list.</p>
          </div>
        </div>
        <label className="ui-check">
          <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} disabled={!picked?.valid} />
          <span>I understand all current data will be replaced with this backup.</span>
        </label>
      </Dialog>

      <ProgressDialog open={!!progress} title={progress?.title} steps={progress?.steps || []} active={progress?.active || 0} />
    </>
  );
}

export default SystemSection;
