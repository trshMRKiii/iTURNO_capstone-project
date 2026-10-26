import { useCallback, useEffect, useRef, useState } from "react";
import { apiService } from "../../../../lib/api-service";

const IDLE = { type: "idle" };

// How long an unattended screen waits before falling back to the idle camera.
export const TIMEOUT_MS = { mode: 30000, driver: 45000, result: 9000 };

const UNREACHABLE = "Can't reach the terminal right now — please see the dispatcher.";

// Server replies carry a `state`; only CHECK_IN continues the flow, every other
// state is a finished screen the driver just reads.
const toScreen = (reply, text) =>
  reply.state === "CHECK_IN"
    ? { type: "mode", text, vehicle: reply.vehicle, drivers: reply.drivers }
    : { type: "result", text, ...reply };

// The vehicle's last driver; with none on record, everyone free.
export const operatorsOf = (drivers) => (drivers.some((d) => d.last) ? drivers.filter((d) => d.last) : drivers);

// Swap driver offers only drivers who have driven this vehicle before.
export const historyOf = (drivers) => (drivers.some((d) => d.suggested) ? drivers.filter((d) => d.suggested) : drivers);

// Self-service flow: scan -> (new visit) tap Queue/Roam -> last driver (or Swap driver by name) -> result.
// A scan for an existing visit goes straight to a result (pay first / wait / checked out).
export function useKiosk() {
  const [screen, setScreen] = useState(IDLE);
  const [activity, setActivity] = useState(0);
  // Whole seconds until the idle fallback fires (for the "Returning to scan in 20s" note).
  const [secondsLeft, setSecondsLeft] = useState(0);
  const screenRef = useRef(screen);
  const busyRef = useRef(false);

  useEffect(() => {
    screenRef.current = screen;
  });

  // Idle fallback; typing/scrolling on the name list re-arms it via touch().
  useEffect(() => {
    const ms = TIMEOUT_MS[screen.type];
    if (!ms) return undefined;
    const end = Date.now() + ms;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    const first = setTimeout(tick, 0);
    const ticker = setInterval(tick, 1000);
    const timer = setTimeout(() => setScreen(IDLE), ms);
    return () => {
      clearTimeout(first);
      clearInterval(ticker);
      clearTimeout(timer);
    };
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
      if (current.type === "mode") return;
      call("/kiosk/scan/", { text }, text);
    },
    [call],
  );

  const backToMode = () => setScreen((s) => ({ ...s, type: "mode", mode: undefined, swapping: false }));
  // Swap driver opens the full name list; the pick comes back to the mode screen, and the
  // check-in then saves them as the vehicle's last driver.
  const startSwap = () => setScreen((s) => ({ ...s, type: "driver", mode: undefined, swapping: true }));
  const pickSwap = (swapDriver) => setScreen((s) => ({ ...s, type: "mode", swapping: false, swapDriver }));
  const checkIn = (driver, mode = screen.mode) =>
    call("/kiosk/check-in/", { vehicle_id: screen.vehicle.id, driver_id: driver.id, mode }, screen.text);
  // The tap picks the mode; a swapped-in driver or a lone last driver is checked in
  // straight away, otherwise the driver is found by name.
  const chooseMode = (mode) => {
    if (screen.swapDriver?.id) return checkIn(screen.swapDriver, mode);
    const operators = operatorsOf(screen.drivers);
    return operators.length === 1 ? checkIn(operators[0], mode) : setScreen((s) => ({ ...s, type: "driver", mode }));
  };

  return {
    screen,
    scan,
    chooseMode,
    startSwap,
    pickSwap,
    backToMode,
    checkIn,
    secondsLeft,
    switchToRoam: () => call("/kiosk/switch-roam/", { text: screen.text }, screen.text),
    reset: () => setScreen(IDLE),
    touch: () => setActivity((n) => n + 1),
  };
}
