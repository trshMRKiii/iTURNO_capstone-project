import React, { useState, useEffect, useRef } from "react";
import { apiService } from '../lib/api-service';
import { useQueueSocket } from '../lib/useQueueSocket';
import sfcLogo from '../pictures/sfc-nobg-logo.png';
import sfcMain from '../pictures/sfc-main.jpg';

const ROTATE_INTERVAL_MS = 15000;
// The terminal is in San Fernando, so drop it from the route label
// ("Bacnotan - San Fernando" -> "Bacnotan"). Display only; grouping uses the full name.
const shortRoute = (name) =>
  name.replace(/\s*[-–—]?\s*San Fernando\s*[-–—]?\s*/i, ' ').trim() || name;

const ROWS_PER_PAGE = 8;
const NEXT_SHOWN = 8;
const LONG_ROUTE_CHARS = 18;

// Flight-board layout: one row per route, paged when there are more routes than
// fit. Sizes are viewport-relative so it stays readable on a TV from a distance.
const css = `
.pv-root { position: fixed; inset: 0; display: flex; flex-direction: column; color: #fff;
  background: #0b1b34 center/cover no-repeat; font-family: system-ui, sans-serif; overflow: hidden; }
.pv-root::before { content: ""; position: absolute; inset: 0; background: rgba(5, 15, 35, 0.82); }
.pv-root > * { position: relative; }
.pv-top { display: flex; align-items: center; justify-content: space-between; padding: 2vh 3vw; gap: 2vw; }
.pv-brand { display: flex; align-items: center; gap: 1.5vw; min-width: 0; }
.pv-brand img { height: 7vh; border-radius: 50%; }
.pv-brand span { font-size: clamp(16px, 3vh, 3vw); font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
.pv-clock { font-size: clamp(16px, 3.4vh, 3vw); font-weight: 600; font-variant-numeric: tabular-nums; text-align: right; }
.pv-body { flex: 1; display: flex; flex-direction: column; padding: 0 3vw 2vh; min-height: 0; transition: opacity .25s; }
.pv-board { flex: 1; display: grid; grid-template-rows: auto repeat(${ROWS_PER_PAGE}, 1fr); gap: .8vh; min-height: 0; }
.pv-head, .pv-line { display: grid; grid-template-columns: 2.6fr 1.3fr 1.4fr 3.2fr; align-items: center; gap: 1.5vw; padding: 0 1.5vw; }
.pv-head { font-size: clamp(11px, 2.2vh, 1.6vw); letter-spacing: .15em; text-transform: uppercase; opacity: .65; padding-bottom: .6vh;
  border-bottom: .25vh solid rgba(255,255,255,.25); }
.pv-line { background: rgba(255,255,255,.08); border-radius: .8vw; font-weight: 800; min-height: 0; font-size: min(4.4vh, 3vw); }
.pv-line:nth-child(even) { background: rgba(255,255,255,.04); }
.pv-line > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pv-line > .pv-route { color: #ffd24d; text-transform: uppercase; white-space: normal; line-height: 1.05;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.pv-line > .pv-long { font-size: .72em; }
.pv-plate, .pv-eta { font-variant-numeric: tabular-nums; letter-spacing: .06em; }
.pv-line > .pv-next { display: flex; flex-wrap: wrap; gap: .5vh .6vw; font-size: .55em; font-weight: 700; opacity: .85;
  white-space: normal; overflow: visible; }
.pv-next i { font-style: normal; background: rgba(255,255,255,.12); border-radius: .5vw; padding: .3vh .7vw; }
.pv-page { text-align: center; font-size: clamp(12px, 2.2vh, 1.6vw); opacity: .6; padding-top: .8vh; }
.pv-empty { flex: 1; display: flex; align-items: center; justify-content: center;
  font-size: clamp(20px, 6vh, 5vw); opacity: .7; }
@media (max-width: 800px) {
  .pv-head { display: none; }
  .pv-line { grid-template-columns: 1fr 1fr; padding: 1vh 3vw; row-gap: .5vh; }
  .pv-next { grid-column: 1 / -1; }
  .pv-board { grid-template-rows: none; overflow-y: auto; }
}
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

  const pageCount = Math.max(1, Math.ceil(routes.length / ROWS_PER_PAGE));

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

  const pageRoutes = routes.slice(pageIndex * ROWS_PER_PAGE, (pageIndex + 1) * ROWS_PER_PAGE);

  return (
    <div className="pv-root" style={{ backgroundImage: `url(${sfcMain})` }}>
      <style>{css}</style>

      <header className="pv-top">
        <div className="pv-brand">
          <img src={sfcLogo} alt="SFC Logo" />
          <span>North Central Terminal</span>
        </div>
        <div className="pv-clock">
          {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          {' · '}
          {now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </div>
      </header>

      <main className="pv-body" style={{ opacity: pageVisible ? 1 : 0 }}>
        {!routes.length ? (
          <div className="pv-empty">{hasLoadedOnce.current ? 'No vehicles in queue.' : 'Loading…'}</div>
        ) : (
          <>
            <div className="pv-board">
              <div className="pv-head">
                <span>Route</span>
                <span>Now Loading</span>
                <span>Est. Departure</span>
                <span>Next in Line</span>
              </div>
              {pageRoutes.map(([name, vehicles]) => {
                const next = vehicles.slice(1, 1 + NEXT_SHOWN);
                const more = vehicles.length - 1 - next.length;
                return (
                  <div className="pv-line" key={name}>
                    <span className={`pv-route${shortRoute(name).length > LONG_ROUTE_CHARS ? ' pv-long' : ''}`}>{shortRoute(name)}</span>
                    <span className="pv-plate">{vehicles[0].plate_number}</span>
                    <span className="pv-eta">{vehicles[0].departure_time || '—'}</span>
                    <span className="pv-next">
                      {next.map((v) => <i key={v.id}>{v.plate_number}</i>)}
                      {more > 0 && <i>+{more}</i>}
                    </span>
                  </div>
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
