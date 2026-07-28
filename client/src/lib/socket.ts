import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@onuw/shared';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * In production the client is served by the same process as the server, and in
 * dev Vite proxies /socket.io — so the default same-origin connection is right
 * in both cases.
 */
export const socket: GameSocket = io({
  autoConnect: true,
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 500,
  reconnectionDelayMax: 4000,
});

// ---------------------------------------------------------------------------
// Session persistence — lets a refresh or a backgrounded phone reclaim its seat
// ---------------------------------------------------------------------------

const SESSION_KEY = 'onuw.session.v1';

export interface StoredSession {
  playerId: string;
  token: string;
  roomCode: string;
}

export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (!parsed.playerId || !parsed.token || !parsed.roomCode) return null;
    return parsed as StoredSession;
  } catch {
    return null;
  }
}

export function saveSession(session: StoredSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Private browsing with storage disabled: rejoin simply won't work.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

const NAME_KEY = 'onuw.name.v1';

export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* ignore */
  }
}

/** Read a room code out of a /r/CODE share link. */
export function codeFromUrl(): string {
  const match = window.location.pathname.match(/^\/r\/([A-Za-z0-9]{4})\/?$/);
  return match ? match[1].toUpperCase() : '';
}

export function shareUrlFor(code: string): string {
  return `${window.location.origin}/r/${code}`;
}
