import React, { useState } from "react";
import { ActionButton, RestoreIcon, TrashIcon, WarningIcon, useFeedback } from "../../../components/ui/kit";

const DAY_MS = 86400000;
const INTERVAL_PRESETS = [{ label: "Daily", days: 1 }, { label: "Weekly", days: 7 }, { label: "Monthly", days: 31 }];
const KEEP_PRESETS = [7, 30, 90];

const intervalText = (n) => {
  if (n === 1) return "Every day";
  const about = n === 7 ? " (about weekly)" : n >= 28 && n <= 31 ? " (about monthly)" : "";
  return `Every ${n} days${about}`;
};

// "+" / "−" stepper around a number input that holds a string so it can be cleared while typing.
function Stepper({ value, onChange, label, min, max }) {
  const n = Number(value) || 0;
  const step = (d) => onChange(String(Math.min(max, Math.max(min, n + d))));
  return (
    <span className="ab-stepper">
      <button type="button" aria-label={`Decrease ${label}`} onClick={() => step(-1)} disabled={n <= min}>&minus;</button>
      <input type="number" min={min} max={max} value={value} aria-label={label} onChange={(e) => onChange(e.target.value)} />
      <button type="button" aria-label={`Increase ${label}`} onClick={() => step(1)} disabled={n >= max}>+</button>
    </span>
  );
}

function Chips({ options, value, onPick }) {
  return options.map((o) => (
    <button key={o.days} type="button" className={`ab-chip${value === o.days ? " is-active" : ""}`} onClick={() => onPick(o.days)}>
      {o.label}
    </button>
  ));
}

// Presentational only: the saved config and the save handler come from settings.jsx.
function AutoBackupCard({ config, onSaveConfig, lastAuto }) {
  const { report } = useFeedback();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Edits sit on top of the saved config until saved.
  const [edits, setEdits] = useState({});
  if (!config) return null;

  const draft = { enabled: config.enabled, interval_days: String(config.interval_days), keep_days: String(config.keep_days), ...edits };
  const setDraft = (patch) => setEdits((e) => ({ ...e, ...patch }));
  const interval = Number(draft.interval_days);
  const keep = Number(draft.keep_days);
  const valid = Number.isInteger(interval) && interval >= 1 && interval <= 90 && Number.isInteger(keep) && keep >= 1 && keep <= 365;
  const dirty = draft.enabled !== config.enabled || interval !== config.interval_days || keep !== config.keep_days;

  // A backup deleted before the next one is made leaves a gap with no automatic backup.
  const gap = valid && keep < interval ? interval - keep : 0;

  const nextDate = () => {
    const base = lastAuto ? new Date(lastAuto.created_at).getTime() : Date.now();
    return new Date(Math.max(base + interval * DAY_MS, Date.now()));
  };

  const save = async () => {
    setSaving(true);
    const outcome = await onSaveConfig({ enabled: draft.enabled, interval_days: interval, keep_days: keep });
    if (outcome.success) setEdits({});
    setSaving(false);
    report(outcome);
  };

  const summary = [
    { icon: <RestoreIcon />, label: "Runs", value: valid ? intervalText(interval) : "—" },
    { icon: <TrashIcon />, label: "Each backup is deleted after", value: valid ? `${keep} day${keep === 1 ? "" : "s"}` : "—" },
    {
      icon: <WarningIcon />,
      label: "Automatic backups on hand",
      value: gap ? "Sometimes none" : "Always at least one",
      warn: !!gap,
    },
    { icon: <span aria-hidden="true">&rarr;</span>, label: "Next automatic backup", value: !draft.enabled ? "Paused" : valid ? nextDate().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—" },
  ];

  return (
    <section className="ab-card">
      <header className="ab-head">
        <div>
          <h3 className="ab-title">Automatic backups</h3>
          <p className="ab-desc">Backups made on a schedule. Manual backups are never deleted.</p>
        </div>
        <button type="button" className="ab-pill" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "Hide settings" : "Show settings"}
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={draft.enabled}
          className={`ab-switch${draft.enabled ? " is-on" : ""}`}
          onClick={() => setDraft({ enabled: !draft.enabled })}
        >
          <span>{draft.enabled ? "On" : "Off"}</span>
          <i />
        </button>
      </header>

      {open && (
        <>
          <div className="ab-body">
            <div className="ab-col">
              <h4 className="ab-label">How often</h4>
              <div className="ab-row">
                <Chips options={INTERVAL_PRESETS} value={interval} onPick={(d) => setDraft({ interval_days: String(d) })} />
                <span className="ab-sub">or every</span>
                <Stepper label="Days between backups" min={1} max={90} value={draft.interval_days} onChange={(v) => setDraft({ interval_days: v })} />
                <span className="ab-sub">days</span>
              </div>

              <h4 className="ab-label">Keep each backup for</h4>
              <div className="ab-row">
                <Chips options={KEEP_PRESETS.map((d) => ({ label: `${d} days`, days: d }))} value={keep} onPick={(d) => setDraft({ keep_days: String(d) })} />
                <span className="ab-sub">or</span>
                <Stepper label="Days to keep each backup" min={1} max={365} value={draft.keep_days} onChange={(v) => setDraft({ keep_days: v })} />
                <span className="ab-sub">days, then delete</span>
              </div>

              {gap > 0 && (
                <div className="ab-warn" role="alert">
                  <WarningIcon size={18} />
                  <div>
                    <p>
                      <strong>Each backup is deleted before the next one is made.</strong>{" "}
                      For {gap} out of every {interval} days you'd have no automatic backup at all.
                    </p>
                    <button type="button" onClick={() => setDraft({ keep_days: String(interval) })}>Keep for {interval} days instead</button>
                  </div>
                </div>
              )}
            </div>

            <aside className="ab-col ab-aside">
              <h4 className="ab-eyebrow">What this means</h4>
              <ul className="ab-summary">
                {summary.map((s) => (
                  <li key={s.label} className={s.warn ? "is-warn" : ""}>
                    <span className="ab-sum-icon">{s.icon}</span>
                    <span>
                      <small>{s.label}</small>
                      <b>{s.value}</b>
                    </span>
                  </li>
                ))}
              </ul>
            </aside>
          </div>

          <footer className="ab-foot">
            <span className={`ab-status${dirty ? " is-dirty" : ""}`}>
              {!valid ? "Interval must be 1–90 days and keep time 1–365 days" : dirty ? "Unsaved changes" : "All changes saved"}
            </span>
            <ActionButton variant="primary" busy={saving} busyLabel="Saving..." disabled={!dirty || !valid} onClick={save}>
              Save changes
            </ActionButton>
          </footer>
        </>
      )}
    </section>
  );
}

export default AutoBackupCard;
