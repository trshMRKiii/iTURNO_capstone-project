import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiService } from "../lib/api-service";

// Vercel-side view: reads mirrored transactions and (for MANAGER/ADMIN)
// edits Route, via /api/remote/* — see api/remote/. This covers one
// settings resource (Route) as a proof of the full pipe end to end; the
// rest of the dashboard (TicketPrice, TerminalPrice, TicketForm, PUVType,
// User management, and the operational LAN-only pages) isn't wired up to
// the remote API yet — a follow-up, not part of this pass.
function RemoteDashboard() {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newRouteName, setNewRouteName] = useState("");

  const canEditSettings = me && ["MANAGER", "SUPERADMIN"].includes(me.role);

  const loadAll = async () => {
    setError("");
    try {
      const [meData, ticketData, routeData] = await Promise.all([
        apiService.get("/current-user"),
        apiService.get("/tickets"),
        apiService.get("/routes"),
      ]);
      setMe(meData);
      setTickets(Array.isArray(ticketData) ? ticketData : []);
      setRoutes(Array.isArray(routeData) ? routeData : []);
    } catch (err) {
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleAddRoute = async (e) => {
    e.preventDefault();
    if (!newRouteName.trim()) return;
    try {
      await apiService.post("/routes", { origin: newRouteName.trim() });
      setNewRouteName("");
      loadAll();
    } catch (err) {
      setError(err.message || "Failed to add route");
    }
  };

  const handleToggleRoute = async (route) => {
    try {
      await apiService.patch(`/routes?id=${route.id}`, { is_active: !route.is_active });
      loadAll();
    } catch (err) {
      setError(err.message || "Failed to update route");
    }
  };

  const handleDeleteRoute = async (route) => {
    try {
      await apiService.delete(`/routes?id=${route.id}`);
      loadAll();
    } catch (err) {
      setError(err.message || "Failed to delete route");
    }
  };

  const handleLogout = () => {
    apiService.logout();
  };

  if (loading) {
    return <div className="p-8 text-slate-500">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-800">Remote Overview</h1>
            {me && (
              <p className="text-sm text-slate-500">
                Signed in as {me.first_name || me.username} ({me.role})
              </p>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            Log out
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="mb-8 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Recent Tickets ({tickets.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4">Ticket</th>
                  <th className="py-2 pr-4">Route</th>
                  <th className="py-2 pr-4">Plate</th>
                  <th className="py-2 pr-4">Driver</th>
                  <th className="py-2 pr-4">Issued by</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Issued</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-mono text-xs">{t.id}</td>
                    <td className="py-2 pr-4">{t.route?.origin || "—"}</td>
                    <td className="py-2 pr-4">{t.vehicle?.plate_number || "—"}</td>
                    <td className="py-2 pr-4">
                      {t.driver ? `${t.driver.first_name} ${t.driver.last_name}` : "—"}
                    </td>
                    <td className="py-2 pr-4">{t.active_user_name || "—"}</td>
                    <td className="py-2 pr-4">{t.status}</td>
                    <td className="py-2 pr-4">{t.collection_amount ?? "—"}</td>
                    <td className="py-2 pr-4 text-xs text-slate-500">
                      {t.issued_at ? new Date(t.issued_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
                {tickets.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-4 text-center text-slate-400">
                      No tickets mirrored yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Routes {canEditSettings ? "" : "(view only)"}
          </h2>

          {canEditSettings && (
            <form onSubmit={handleAddRoute} className="mb-4 flex gap-2">
              <input
                value={newRouteName}
                onChange={(e) => setNewRouteName(e.target.value)}
                placeholder="New route origin"
                className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
              <button
                type="submit"
                className="rounded-md bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
              >
                Add
              </button>
            </form>
          )}

          <ul className="divide-y divide-slate-100">
            {routes.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                <span className={r.is_active ? "text-slate-800" : "text-slate-400 line-through"}>
                  {r.origin}
                </span>
                {canEditSettings && (
                  <span className="flex gap-2">
                    <button
                      onClick={() => handleToggleRoute(r)}
                      className="text-xs text-slate-500 hover:text-slate-800"
                    >
                      {r.is_active ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      onClick={() => handleDeleteRoute(r)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </span>
                )}
              </li>
            ))}
            {routes.length === 0 && (
              <li className="py-4 text-center text-slate-400">No routes yet.</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}

export default RemoteDashboard;
