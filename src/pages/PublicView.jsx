import React, { useState, useEffect, useRef } from "react";
import { apiService } from '../lib/api-service';
import { useQueueSocket } from '../lib/useQueueSocket';
import sfcLogo from '../pictures/sfc-nobg-logo.png';

const ROTATE_INTERVAL_MS = 15000;
// The terminal is in San Fernando, so drop it from the route label
// ("Bacnotan - San Fernando" -> "Bacnotan"). Display only; grouping uses the full name.
const shortRoute = (name) =>
  name.replace(/\s*[-–—]?\s*San Fernando\s*[-–—]?\s*/i, ' ').trim() || name;

const CARDS_PER_PAGE = 8;
const NEXT_SHOWN = 3;

// Card-board layout: one card per route in a 4x2 grid, paged when there are more
// than CARDS_PER_PAGE routes. Sizes are viewport-relative so it reads from a distance on a TV.
const css = `
.pv-root { position: fixed; inset: 0; display: flex; flex-direction: column; color: #fff; overflow: hidden;
  background: linear-gradient(160deg, #1b2c54 0%, #0e1a36 55%, #091226 100%); font-family: Inter, Helvetica, Arial, sans-serif; }
.pv-top { display: flex; align-items: center; justify-content: space-between; padding: 3vh 2.5vw 2vh; gap: 2vw; }
.pv-brand { display: flex; align-items: center; gap: 1.2vw; min-width: 0; }
.pv-brand img { height: 6vh; border-radius: 50%; }
.pv-brand span { font-size: clamp(16px, 3vh, 2.2vw); font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
.pv-clock { text-align: right; font-variant-numeric: tabular-nums; }
.pv-clock b { display: block; font-family: ui-monospace, Consolas, monospace; font-size: clamp(20px, 5vh, 3.4vw); font-weight: 800; }
.pv-clock small { font-size: clamp(14px, 2.8vh, 1.8vw); opacity: .85; }
.pv-body { flex: 1; display: flex; flex-direction: column; padding: 0 2.5vw 2.5vh; min-height: 0; transition: opacity .25s; }
.pv-board { flex: 1; display: grid; grid-template-columns: repeat(var(--cols, 4), 1fr); grid-template-rows: repeat(var(--rows, 2), 1fr); gap: 1.6vh 1.1vw; min-height: 0; }
.pv-card { grid-column: var(--gc, auto); display: flex; flex-direction: column; min-height: 0; overflow: hidden; border-radius: 2.5cqh;
  container-type: size; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); }
/* Type is sized from the card itself (cqw/cqh), so it scales with column count and row count. */
.pv-card-head { --hf: min(6cqh, 6.5cqw); display: flex; align-items: center; justify-content: center; text-align: center;
  height: calc(var(--hf) * 2.3 + 6cqh); padding: 0 5cqw; background: rgba(255,255,255,.12); color: #f5c451; font-weight: 800;
  text-transform: uppercase; letter-spacing: .03em; font-size: var(--hf); line-height: 1.1; }
.pv-card-body { flex: 1; display: flex; flex-direction: column; justify-content: space-evenly; padding: 3cqh 5cqw; min-height: 0; }
.pv-label { font-size: min(3.6cqh, 4.4cqw); letter-spacing: .16em; text-transform: uppercase; font-weight: 700; opacity: .65; }
.pv-plate { font-family: ui-monospace, Consolas, monospace; font-weight: 800; letter-spacing: .02em; line-height: 1.1;
  font-size: min(16cqh, 16cqw); white-space: nowrap; }
.pv-eta { font-family: ui-monospace, Consolas, monospace; font-weight: 700; font-size: min(10cqh, 11cqw); }
.pv-sep { border-top: 1px solid rgba(255,255,255,.12); }
.pv-next { display: flex; flex-wrap: wrap; gap: 1.5cqh 1.5cqw; margin-top: 1cqh; }
.pv-next i { font-style: normal; display: inline-flex; align-items: center; gap: 1.5cqw; padding: 1.5cqh 2cqw; border-radius: 1.6cqh;
  background: rgba(255,255,255,.1); font-family: ui-monospace, Consolas, monospace; font-weight: 700; font-size: min(6cqh, 6cqw); }
.pv-next i em { font-style: normal; font-family: inherit; font-size: .7em; padding: .3em .5em; border-radius: .4em; background: rgba(255,255,255,.15); }
.pv-next i.pv-more { background: none; border: 1px dashed rgba(255,255,255,.3); opacity: .75; font-family: inherit; }
.pv-none { margin-top: 1cqh; opacity: .55; font-size: min(4.6cqh, 5.4cqw); }
.pv-page { text-align: center; font-size: clamp(12px, 2vh, 1.2vw); opacity: .6; padding-top: 1vh; }
.pv-empty { flex: 1; display: flex; align-items: center; justify-content: center;
  font-size: clamp(20px, 6vh, 5vw); opacity: .7; }
@media (max-width: 1100px) { .pv-card { grid-column: auto; min-height: 60vh; } .pv-board { grid-template-columns: repeat(2, 1fr); grid-template-rows: none; overflow-y: auto; } }
@media (max-width: 600px) { .pv-board { grid-template-columns: 1fr; } }
`;

function PublicView() {
  const [queue,       setQueue]       = useState([]);
  const [now,         setNow]         = useState(new Date());
  const [pageIndex,   setPageIndex]   = useState(0);
  const [pageVisible, setPageVisible] = useState(true);
  const hasLoadedOnce = useRef(false);

  useEffect(() => {
    const clockTimer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clockTimer);
  }, []);

  // Public endpoint (no login). Vehicles arrive ordered by queue rank, so
  // index 0 within a route is the next to depart.
  const loadQueue = async () => {
    try {
      const data = await apiService.get('/queue/');
      setQueue(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load queue:', err);
    } finally {
      hasLoadedOnce.current = true;
    }
  };

  useEffect(() => { loadQueue(); }, []);
  useQueueSocket(loadQueue);

  const routes = Object.entries(queue.reduce((acc, v) => {
    (acc[v.route || 'No Route'] ||= []).push(v);
    return acc;
  }, {})).sort(([a], [b]) => a.localeCompare(b));

  const pageCount = Math.max(1, Math.ceil(routes.length / CARDS_PER_PAGE));

  useEffect(() => {
    if (pageIndex >= pageCount) setPageIndex(0);
  }, [pageCount, pageIndex]);

  useEffect(() => {
    if (pageCount <= 1) return;
    let swap;
    const timer = setInterval(() => {
      setPageVisible(false);
      swap = setTimeout(() => {
        setPageIndex((prev) => (prev + 1) % pageCount);
        setPageVisible(true);
      }, 250);
    }, ROTATE_INTERVAL_MS);
    return () => { clearInterval(timer); clearTimeout(swap); };
  }, [pageCount]);

  const pageRoutes = routes.slice(pageIndex * CARDS_PER_PAGE, (pageIndex + 1) * CARDS_PER_PAGE);

  // Fit the grid to this page's cards. Up to 4 routes share one row and fill it. Beyond
  // that, rows hold 4 cards (3 when there are 5 or 6, so 6 splits 3+3 and 5 puts 2 under a row of 3) on a
  // 24-track grid, and a short last row is centered.
  const n = pageRoutes.length;
  const wide = n > 4;
  const perRow = n === 5 || n === 6 ? 3 : 4;
  const span = 24 / perRow;
  const cols = wide ? 24 : Math.max(1, n);
  const rows = wide ? Math.ceil(n / perRow) : 1;
  const lastRow = n % perRow || perRow;
  const cardColumn = (i) => {
    if (!wide) return undefined;
    const first = n - lastRow;
    if (i < first) return `span ${span}`;
    return `${1 + (24 - lastRow * span) / 2 + (i - first) * span} / span ${span}`;
  };

  return (
    <div className="pv-root">
      <style>{css}</style>

      <header className="pv-top">
        <div className="pv-brand">
          <img src={sfcLogo} alt="SFC Logo" />
          <span>North Central Terminal</span>
        </div>
        <div className="pv-clock">
          <b>{now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</b>
          <small>{now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</small>
        </div>
      </header>

      <main className="pv-body" style={{ opacity: pageVisible ? 1 : 0 }}>
        {!routes.length ? (
          <div className="pv-empty">{hasLoadedOnce.current ? 'No vehicles in queue.' : 'Loading…'}</div>
        ) : (
          <>
            <div className="pv-board" style={{ '--cols': cols, '--rows': rows }}>
              {pageRoutes.map(([name, vehicles], i) => {
                const label = shortRoute(name);
                const next = vehicles.slice(1, 1 + NEXT_SHOWN);
                const more = vehicles.length - 1 - next.length;
                return (
                  <section className="pv-card" key={name} style={{ '--gc': cardColumn(i) }}>
                    <div className="pv-card-head">{label}</div>
                    <div className="pv-card-body">
                      <span className="pv-label">Now Loading</span>
                      <div className="pv-plate">{vehicles[0].plate_number}</div>
                      <span className="pv-label">Est. Departure</span>
                      <div className="pv-eta">{vehicles[0].departure_time || '—'}</div>
                      <div className="pv-sep" />
                      <span className="pv-label">Next in Line</span>
                      {next.length ? (
                        <div className="pv-next">
                          {next.map((v, i) => <i key={v.id}><em>{i + 1}</em>{v.plate_number}</i>)}
                          {more > 0 && <i className="pv-more">+{more} more</i>}
                        </div>
                      ) : <div className="pv-none">No vehicles waiting</div>}
                    </div>
                  </section>
                );
              })}
            </div>
            {pageCount > 1 && <div className="pv-page">Page {pageIndex + 1} of {pageCount}</div>}
          </>
        )}
      </main>
    </div>
  );
}

export default PublicView;
