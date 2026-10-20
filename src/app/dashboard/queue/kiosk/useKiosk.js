import { useCallback, useEffect, useRef, useState } from "react";
import { apiService } from "../../../../lib/api-service";

const IDLE = { type: "idle" };

// How long an unattended screen waits before falling back to the idle camera.
const TIMEOUT_MS = { mode: 30000, driver: 45000, result: 9000 };

const UNREACHABLE = "Can't reach the terminal right now — please see the dispatcher.";

// Server replies carry a `state`; only CHECK_IN continues the flow, every other
// state is a finished screen the driver just reads.
const toScreen = (reply, text) =>
  reply.state === "CHECK_IN"
    ? { type: "mode", text, vehicle: reply.vehicle, drivers: reply.drivers }
    : { type: "result", text, ...reply };

// Self-service flow: scan -> (new visit) pick Queue/Roam -> pick own name -> result.
// A scan for an existing visit goes straight to a result (pay first / wait / checked out).
export function useKiosk() {
  const [screen, setScreen] = useState(IDLE);
  const [activity, setActivity] = useState(0);
  const screenRef = useRef(screen);
  const busyRef = useRef(false);

  useEffect(() => {
    screenRef.current = screen;
  });

  // Idle fallback; typing/scrolling on the name list re-arms it via touch().
  useEffect(() => {
    const ms = TIMEOUT_MS[screen.type];
    if (!ms) return undefined;
    const timer = setTimeout(() => setScreen(IDLE), ms);
    return () => clearTimeout(timer);
  }, [screen, activity]);

  const call = useCallback(async (path, body, text) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setScreen({ type: "busy" });
    try {
      setScreen(toScreen(await apiService.post(path, body), text));
    } catch (err) {
      setScreen({ type: "result", text, state: "ERROR", message: err.status ? err.message : UNREACHABLE });
    } finally {
      busyRef.current = false;
    }
  }, []);

  // The camera never stops, so a QR held in view must not re-trigger the screen it just caused.
  const scan = useCallback(
    (text) => {
      const current = screenRef.current;
      if (current.type === "result" && current.text === text) return;
      call("/kiosk/scan/", { text }, text);
    },
    [call],
  );

  const chooseMode = (mode) => setScreen((s) => ({ ...s, type: "driver", mode }));
  const backToMode = () => setScreen((s) => ({ ...s, type: "mode", mode: undefined }));
  const checkIn = (driver) =>
    call("/kiosk/check-in/", { vehicle_id: screen.vehicle.id, driver_id: driver.id, mode: screen.mode }, screen.text);

  return {
    screen,
    scan,
    chooseMode,
    backToMode,
    checkIn,
    reset: () => setScreen(IDLE),
    touch: () => setActivity((n) => n + 1),
  };
}
