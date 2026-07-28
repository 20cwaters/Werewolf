import { Room, type TypedServer } from './Room';
import { makeRoomCode } from './names';

/** Rooms with nobody connected are reclaimed after this long. */
const ABANDONED_TTL_MS = 5 * 60 * 1000;
/** Hard ceiling on room lifetime, so a forgotten tab cannot leak forever. */
const IDLE_TTL_MS = 3 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

/**
 * In-memory room registry. Games are single-round and short-lived, so there is
 * nothing worth persisting — a restart simply drops everything.
 */
export class RoomManager {
  private rooms = new Map<string, Room>();
  private sweeper: NodeJS.Timeout | null = null;

  constructor(private readonly io: TypedServer) {}

  get size(): number {
    return this.rooms.size;
  }

  create(): Room {
    let code = makeRoomCode();
    // Codes are short; retry on collision, then widen the search.
    for (let attempt = 0; this.rooms.has(code) && attempt < 50; attempt++) {
      code = makeRoomCode();
    }
    if (this.rooms.has(code)) {
      throw new Error('Could not allocate a free room code.');
    }
    const room = new Room(code, this.io);
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  destroy(code: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    room.dispose();
    this.rooms.delete(code);
  }

  /** Drop a room once its last human has left and is not coming back. */
  destroyIfAbandoned(code: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    if (room.humanCount === 0) this.destroy(code);
  }

  startSweeper(): void {
    if (this.sweeper) return;
    this.sweeper = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    // Never hold the process open for the sweeper alone.
    this.sweeper.unref?.();
  }

  stopSweeper(): void {
    if (this.sweeper) clearInterval(this.sweeper);
    this.sweeper = null;
  }

  sweep(now = Date.now()): number {
    let removed = 0;
    for (const [code, room] of this.rooms) {
      const idle = now - room.lastActivity;
      const abandoned = room.connectedHumanCount === 0 && idle > ABANDONED_TTL_MS;
      if (abandoned || idle > IDLE_TTL_MS) {
        this.destroy(code);
        removed += 1;
      }
    }
    return removed;
  }
}
