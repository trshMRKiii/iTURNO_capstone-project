import { useEffect, useState } from "react";
import { apiService } from "./api-service";

// Shared WIP-mode state: anything that changes it calls publishWipMode(), and every
// mounted useWipMode() (banner, settings tab) updates instantly with no refresh.
// A light poll + focus refetch also picks up changes made from another terminal.
const EVENT = "wip-mode-changed";
const POLL_MS = 8000;

export function publishWipMode(data) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: data }));
}

export function useWipMode() {
  const [wipMode, setWipMode] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      apiService
        .getWipMode()
        .then((data) => {
          if (!cancelled) setWipMode(data);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    const onChange = (e) => setWipMode(e.detail);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };

    load();
    window.addEventListener(EVENT, onChange);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(onVisible, POLL_MS);
    return () => {
      cancelled = true;
      window.removeEventListener(EVENT, onChange);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, []);

  return { wipMode, loading };
}
