import { useEffect, useState } from 'react';
import { getServerState, onServerState, wakeServer, type ServerState } from '../api/client';

const TEXT: Record<ServerState, string> = {
  checking: 'Connecting to the lab…',
  waking: 'Waking the server up — free hosting naps when nobody plays. This can take a minute or two…',
  ready: 'Server online',
  down: 'The server is not answering. Try again in a moment.',
};

/** Starts waking the backend as soon as it mounts and shows how that's going. */
export function ServerStatus() {
  const [state, setState] = useState<ServerState>(getServerState);
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const off = onServerState(setState);
    void wakeServer();
    return off;
  }, []);
  useEffect(() => {
    if (state !== 'waking') return;
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [state]);
  return (
    <p className={`server-status ${state}`} role="status" aria-live="polite">
      <i className="dot" />
      {TEXT[state]}
      {state === 'waking' && secs > 2 && <b> {secs}s</b>}
      {state === 'down' && <button type="button" className="link-btn" onClick={() => { void wakeServer(); }}>Retry</button>}
    </p>
  );
}

/** True once the backend has answered a health check. */
export function useServerReady(): boolean {
  const [state, setState] = useState<ServerState>(getServerState);
  useEffect(() => onServerState(setState), []);
  return state === 'ready';
}
