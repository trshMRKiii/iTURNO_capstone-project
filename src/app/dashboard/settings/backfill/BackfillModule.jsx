import { useState } from "react";
import { IS_REMOTE } from "../../../../lib/api-service";
import TicketBackfillTab from "./TicketBackfillTab";
import BackfillRecords from "./BackfillRecords";
import "../../../../styles/TicketBackfill.css";

const VIEWS = [["record", "Record"], ["recorded", "Recorded so far"]];

// One module for paper/outage tickets: "Record" backfills the trips (time, plate, mode) and either
// leaves their cash to be remitted or files it as already remitted; "Recorded so far" lists the
// backfilled remittances so a mistake can be undone.
export default function BackfillModule() {
  const [view, setView] = useState("record");
  return (
    <div className="bf bf-tab">
      <div className="tbf-mode-switch">
        {VIEWS.map(([key, label]) => (
          <button key={key} type="button" className={`tbf-mode-btn ${view === key ? "tbf-mode-btn--active" : ""}`} onClick={() => setView(key)}>
            {label}
          </button>
        ))}
      </div>
      {view === "record" ? <TicketBackfillTab />
        : IS_REMOTE ? <p className="set-rewards-note">This only works from the LAN terminal itself.</p>
        : <BackfillRecords />}
    </div>
  );
}
