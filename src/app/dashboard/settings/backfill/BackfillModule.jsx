import { useCallback, useEffect, useState } from "react";
import { apiService, IS_REMOTE } from "../../../../lib/api-service";
import { getPhDateString } from "../../../../lib/phDate";
import IssuedStatus from "../../remittance/IssuedStatus";
import TicketBackfillTab from "./TicketBackfillTab";
import BackfillRecords from "./BackfillRecords";
import "../../../../styles/TicketBackfill.css";

const VIEWS = [["record", "Record"], ["recorded", "Recorded so far"]];

// One module for paper/outage tickets. "Record" backfills trips that never made it into the system
// and either leaves their cash to be remitted or files the whole day as already remitted (new trips
// plus what the system already held that day); "Recorded so far" lists those so a mistake can be
// undone. The cards above show what is still unremitted on the chosen day.
export default function BackfillModule() {
  const [view, setView] = useState("record");
  const [date, setDate] = useState(getPhDateString(0));
  const [status, setStatus] = useState(null);
  const [version, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  const loadStatus = useCallback(() => {
    // A failed load leaves the cards loading; the Remittance page reports the same failure properly.
    apiService.get(`/report/eod-reconciliation/?date=${date}`).then(setStatus).catch(() => setStatus(null));
  }, [date]);

  useEffect(() => { loadStatus(); }, [loadStatus, version]);

  return (
    <div className="bf bf-tab">
      <label className="bf-status-date">
        <span className="usr-label">Unremitted on</span>
        <input type="date" className="usr-input" max={getPhDateString(0)} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </label>
      <IssuedStatus date={date} isLate={date < getPhDateString(0)} data={status} loading={status?.date !== date} />

      <div className="tbf-mode-switch">
        {VIEWS.map(([key, label]) => (
          <button key={key} type="button" className={`tbf-mode-btn ${view === key ? "tbf-mode-btn--active" : ""}`} onClick={() => setView(key)}>
            {label}
          </button>
        ))}
      </div>
      {view === "record" ? <TicketBackfillTab onSaved={refresh} />
        : IS_REMOTE ? <p className="set-rewards-note">This only works from the LAN terminal itself.</p>
        : <BackfillRecords onChange={refresh} />}
    </div>
  );
}
