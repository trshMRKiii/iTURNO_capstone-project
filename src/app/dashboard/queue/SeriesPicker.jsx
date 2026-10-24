import React, { useState } from "react";

const labelOf = (s) => s?.ticket_form_label || "Unspecified";
const LOW_STOCK_RATIO = 0.1;

// How much of the series is left, as a 0-1 ratio of its start..end range.
const remainingRatio = (s) => {
  const total = Number(s.end_no) - Number(s.start_no) + 1;
  return total > 0 ? Math.min(1, (s.pcs ?? s.remaining ?? 0) / total) : 1;
};

const OptionList = ({ title, variant, options, activeId, onPick }) => (
  <div className="queue-series-group">
    <span className="queue-label">{title}</span>
    <div className={`queue-series-options queue-series-options--${variant}`} role="listbox" aria-label={title}>
      {options.map(({ id, text }) => (
        <button
          key={id}
          type="button"
          role="option"
          aria-selected={String(id) === String(activeId)}
          className={`queue-series-option${String(id) === String(activeId) ? " is-active" : ""}`}
          onClick={() => onPick(String(id))}
        >
          {text}
        </button>
      ))}
    </div>
  </div>
);

// Ticket denomination summary + "Change Series" drawer. The picked series lives
// in useQueue (shared by Roaming issuance and Dispatch). `pickExact` also lets the
// operator choose a specific series of the denomination instead of the default.
function SeriesPicker({
  availableSeries,
  allSeries = [],
  selectedSeriesId,
  setSelectedSeriesId,
  setSeriesOverrideId = () => {},
  onChange,
  pickExact = false,
  onMix,
  exhaustedLabel = "",
}) {
  const [open, setOpen] = useState(false);
  const selected = allSeries.find((s) => String(s.id) === String(selectedSeriesId));

  const toggle = () => {
    if (open) setSeriesOverrideId("");
    setOpen(!open);
  };

  return (
    <div className="queue-roam-series">
      <div className="queue-roam-series-row">
        <div>
          <span className="queue-label">Cash ticket</span>
          <div className="queue-roam-series-name">
            {selected ? labelOf(selected) : "No series with stock"}
          </div>
        </div>
        {selectedSeriesId && (
          <div className="queue-series-actions">
            <button type="button" className="queue-change-series-btn" onClick={toggle}>
              {open ? "Done" : "Change Series"}
            </button>
            {onMix && availableSeries.length > 1 && (
              <button
                type="button"
                className="queue-change-series-btn"
                onClick={() => {
                  setSeriesOverrideId("");
                  setOpen(false);
                  onMix();
                }}
              >
                + Mix Values
              </button>
            )}
          </div>
        )}
      </div>
      {selected && (
        <>
          <span className="queue-series-range">Series {selected.start_no}-{selected.end_no}</span>
          <div className="queue-series-bar">
            <div
              className={remainingRatio(selected) < LOW_STOCK_RATIO ? "is-low" : undefined}
              style={{ width: `${remainingRatio(selected) * 100}%` }}
            />
          </div>
          <span className={`queue-series-left${remainingRatio(selected) < LOW_STOCK_RATIO ? " is-low" : ""}`}>
            {selected.pcs ?? selected.remaining ?? 0} pcs remaining{remainingRatio(selected) < LOW_STOCK_RATIO ? " · running low" : ""}
          </span>
        </>
      )}
      {open && (
        <>
          {/* Options are listed right away — no second dropdown to open. */}
          <OptionList
            title="Denomination"
            variant="denom"
            options={availableSeries.map((s) => ({ id: s.id, text: labelOf(s) }))}
            activeId={availableSeries.find((s) => labelOf(s) === labelOf(selected))?.id ?? selectedSeriesId}
            onPick={(id) => {
              setSeriesOverrideId("");
              setSelectedSeriesId(id);
              onChange?.();
              if (!pickExact) setOpen(false);
            }}
          />
          {pickExact && (
            <OptionList
              title="Series"
              variant="series"
              options={allSeries
                .filter((s) => labelOf(s) === labelOf(selected))
                .map((s) => ({ id: s.id, text: `Series ${s.series_no} (${s.pcs} pcs remaining)` }))}
              activeId={selectedSeriesId}
              onPick={setSeriesOverrideId}
            />
          )}
        </>
      )}
      {availableSeries.length === 0 && (
        <span className="queue-alert queue-alert--error">No ticket series with stock available.</span>
      )}
      {exhaustedLabel && availableSeries.length > 0 && (
        <span className="queue-alert queue-alert--error">
          {exhaustedLabel} has run out, so the kiosk now draws {labelOf(selected)} by default. Use Change Series to pick another denomination.
        </span>
      )}
    </div>
  );
}

export default SeriesPicker;
