import React, { useState } from "react";

const labelOf = (s) => s?.ticket_form_label || "Unspecified";

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
          <select
            className="queue-select"
            value={
              availableSeries.find((s) => labelOf(s) === labelOf(selected))?.id ?? selectedSeriesId
            }
            onChange={(e) => {
              setSeriesOverrideId("");
              setSelectedSeriesId(e.target.value);
              onChange?.();
            }}
          >
            {availableSeries.map((s) => (
              <option key={s.id} value={s.id}>
                {labelOf(s)}
              </option>
            ))}
          </select>
          {pickExact && (
            <select
              className="queue-select"
              value={selectedSeriesId}
              onChange={(e) => setSeriesOverrideId(e.target.value)}
            >
              {allSeries
                .filter((s) => labelOf(s) === labelOf(selected))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    Series {s.series_no} ({s.pcs} pcs remaining)
                  </option>
                ))}
            </select>
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
