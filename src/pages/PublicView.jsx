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

const TOP_COUNT = 5;
const MAX_REST = 12;

// All sizes are viewport-relative so the board scales from a laptop to a
// TV readable from 10-20 feet away.
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
.pv-body { flex: 1; display: grid; grid-template-columns: 1.1fr 1fr; gap: 3vw; padding: 0 3vw 3vh; min-height: 0;
  transition: opacity .25s; }
.pv-time { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
  background: rgba(255,255,255,.07); border: .3vh solid rgba(255,255,255,.15); border-radius: 2vw; padding: 2vh 2vw; min-width: 0; }
.pv-route { font-size: clamp(28px, 9vh, 7vw); font-weight: 800; color: #ffd24d; text-transform: uppercase; line-height: 1.1; }
.pv-label { font-size: clamp(20px, 5.6vh, 4.6vw); letter-spacing: .15em; text-transform: uppercase; opacity: .8; margin-top: 3vh; }
.pv-big { font-size: min(24vh, 13vw); font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; margin-top: 1vh; }
.pv-list { display: flex; flex-direction: column; gap: 1.2vh; min-width: 0; min-height: 0; }
.pv-row { flex: 1; display: flex; align-items: center; gap: 2vw; padding: 0 2vw; min-height: 0;
  background: rgba(255,255,255,.08); border-radius: 1.2vw; font-weight: 800; letter-spacing: .06em; }
.pv-row:first-child { background: #ffd24d; color: #0b1b34; }
.pv-num { opacity: .6; min-width: 1.6em; text-align: center; }
.pv-rest { flex: 2; display: grid; grid-template-columns: 1fr 1fr; grid-auto-rows: 1fr; gap: 1vh 1.5vw; min-height: 0;
  font-size: min(3.6vh, 2.6vw); }
.pv-rest .pv-row { padding: 0 1.2vw; gap: 1vw; border-radius: .8vw; }
.pv-rest .pv-row:first-child { background: rgba(255,255,255,.08); color: inherit; }
.pv-more { text-align: center; font-size: clamp(14px, 3vh, 2.5vw); opacity: .75; }
.pv-empty { grid-column: 1 / -1; display: flex; align-items: center; justify-content: center;
  font-size: clamp(20px, 6vh, 5vw); opacity: .7; }
@media (max-width: 800px) { .pv-body { grid-template-columns: 1fr; overflow-y: auto; } .pv-big { font-size: 22vw; } }
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

  // One route per page, rotating through every route.
  const routes = Object.entries(queue.reduce((acc, v) => {
    (acc[v.route || 'No Route'] ||= []).push(v);
    return acc;
  }, {}));

  useEffect(() => {
    if (pageIndex >= routes.length) setPageIndex(0);
  }, [routes.length, pageIndex]);

  useEffect(() => {
    if (routes.length <= 1) return;
    let swap;
    const timer = setInterval(() => {
      setPageVisible(false);
      swap = setTimeout(() => {
        setPageIndex((prev) => (prev + 1) % routes.length);
        setPageVisible(true);
      }, 250);
    }, ROTATE_INTERVAL_MS);
    return () => { clearInterval(timer); clearTimeout(swap); };
  }, [routes.length]);

  const [routeName, vehicles] = routes[pageIndex] || [];
  const top = (vehicles || []).slice(0, TOP_COUNT);
  const rest = (vehicles || []).slice(TOP_COUNT, TOP_COUNT + MAX_REST);
  const hidden = (vehicles?.length || 0) - TOP_COUNT - rest.length;

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
        {!vehicles ? (
          <div className="pv-empty">{hasLoadedOnce.current ? 'No vehicles in queue.' : 'Loading…'}</div>
        ) : (
          <>
            <section className="pv-time">
              <div className="pv-route">{shortRoute(routeName)}</div>
              <div className="pv-label">Estimated Departure</div>
              <div className="pv-big">{vehicles[0].departure_time || '—'}</div>
            </section>

            <section className="pv-list">
              <div className="pv-list" style={{ flex: TOP_COUNT, fontSize: 'min(8vh, 6vw)' }}>
                {top.map((v, idx) => (
                  <div className="pv-row" key={v.id}>
                    <span className="pv-num">{idx + 1}</span>
                    <span>{v.plate_number}</span>
                  </div>
                ))}
              </div>
              {rest.length > 0 && (
                <div className="pv-rest">
                  {rest.map((v, idx) => (
                    <div className="pv-row" key={v.id}>
                      <span className="pv-num">{idx + TOP_COUNT + 1}</span>
                      <span>{v.plate_number}</span>
                    </div>
                  ))}
                </div>
              )}
              {hidden > 0 && <div className="pv-more">+{hidden} more</div>}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default PublicView;
