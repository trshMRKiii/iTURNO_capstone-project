import { useEffect, useRef, useState } from "react";
import { apiService } from "../../../lib/api-service";
import { useFeedback } from "../../../components/ui/kit";

// The Dispatch desk (DeskDuty in backend/api/models.py): which Personnel is checking vehicles
// in and which is checking them out, plus the ticket series (and per-price mixed recipes) the kiosk draws from. It lives on
// the server so the kiosk tab and every Dispatch tab stamp the same people.
// `adoptSeries` lets a page that keeps its own series pick start from the server's instead,
// so a refresh (or a different browser) doesn't silently revert what the desk chose.
export function useDeskDuty(seriesId, adoptSeries) {
  const [duty, setDuty] = useState(null);
  const serverSeries = useRef(null);
  const { notify } = useFeedback();

  useEffect(() => {
    apiService.getDeskDuty().then((d) => {
      serverSeries.current = String(d.series ?? "");
      if (d.series && adoptSeries) adoptSeries(String(d.series));
      setDuty(d);
    }).catch(() => setDuty({})); // unreachable: show the empty desk rather than loading forever
  }, []);

  // Dispatch auto-picks a series when none was chosen, so the server's copy follows what the board shows.
  const loaded = duty !== null;
  useEffect(() => {
    if (!loaded || !seriesId || serverSeries.current === String(seriesId)) return;
    const previous = serverSeries.current;
    serverSeries.current = String(seriesId);
    apiService.setDeskDuty({ series: seriesId }).catch(() => { serverSeries.current = previous; });
  }, [loaded, seriesId]);

  const update = async (fields) => {
    try {
      setDuty(await apiService.setDeskDuty(fields));
      return true;
    } catch (err) {
      notify.error({ title: err.message || "Couldn't update the desk." });
      return false;
    }
  };

  return {
    loaded,
    personnel: duty?.personnel ?? [],
    checkinId: duty?.checkin_user ?? "",
    checkoutId: duty?.checkout_user ?? "",
    recipes: duty?.recipes ?? {},
    setCheckin: (id) => update({ checkin_user: id }),
    setCheckout: (id) => update({ checkout_user: id }),
    setRecipes: (recipes) => update({ recipes }),
  };
}
