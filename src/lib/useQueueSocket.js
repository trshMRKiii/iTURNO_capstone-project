import { useEffect, useRef } from "react";

const WS_BASE_URL =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "ws://localhost:8000"
    : `ws://${window.location.hostname}:8000`;

// Subscribes to the backend's queue-update broadcast and invokes
// onUpdate() whenever a vehicle/ticket change affects the queue.
// Auto-reconnects with backoff if the connection drops.
export function useQueueSocket(onUpdate) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    let socket;
    let reconnectTimer;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      socket = new WebSocket(`${WS_BASE_URL}/ws/queue/`);

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'queue_updated') onUpdateRef.current();
        } catch {
          // ignore malformed frames
        }
      };

      socket.onclose = () => {
        if (!cancelled) reconnectTimer = setTimeout(connect, 3000);
      };

      socket.onerror = () => socket.close();
    };

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      // Closing a socket still in CONNECTING state logs a benign browser
      // warning (hit reliably under StrictMode's mount/cleanup/remount).
      // Deferring the close until it actually opens avoids the noise.
      if (socket?.readyState === WebSocket.CONNECTING) {
        socket.addEventListener('open', () => socket.close());
      } else {
        socket?.close();
      }
    };
  }, []);
}
