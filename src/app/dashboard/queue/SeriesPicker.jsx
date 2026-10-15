import React, { useState } from "react";

const labelOf = (s) => s?.ticket_form_label || "Unspecified";

const OptionList = ({ options, activeId, onPick }) => (
  <div className="queue-series-options" role="listbox">
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
          <button type="button" className="queue-change-series-btn" onClick={toggle}>
            {open ? "Done" : "Change Series"}
          </button>
        )}
      </div>
      {open && (
        <>
          {/* Options are listed right away — no second dropdown to open. */}
          <OptionList
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
        <span className="dispatch-modal-field-error">No ticket series with stock available.</span>
      )}
    </div>
  );
}

export default SeriesPicker;
