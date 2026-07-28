import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { Server, type Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ErrorPayload,
  JoinedPayload,
  NightAction,
  ServerToClientEvents,
} from '@onuw/shared';
import { Room, type TypedServer } from './Room';
import { RoomManager } from './RoomManager';
import { normalizeCode, sanitizeName } from './names';

type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

interface SocketData {
  roomCode?: string;
  playerId?: string;
}

const PORT = Number(process.env.PORT ?? 3000);
const isProd = process.env.NODE_ENV === 'production';

const app = express();
app.disable('x-powered-by');

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, rooms: manager.size, uptime: Math.round(process.uptime()) });
});

const server = http.createServer(app);

const io: TypedServer = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  // In dev the Vite server proxies /socket.io, so requests are same-origin.
  // In production the client is served by this very process.
  cors: isProd ? undefined : { origin: true, credentials: true },
  pingTimeout: 20000,
  pingInterval: 10000,
});

const manager = new RoomManager(io);
manager.startSweeper();

// ---------------------------------------------------------------------------
// Static client
// ---------------------------------------------------------------------------

const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(
    express.static(clientDist, {
      // Vite emits content-hashed asset filenames, so they cache forever;
      // index.html must not.
      setHeaders(res, filePath) {
        if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
      },
      maxAge: '1y',
      index: false,
    })
  );
  // SPA fallback: room links like /r/ABCD must serve the app shell.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/socket.io') || req.path === '/healthz') return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res
      .status(200)
      .type('text/plain')
      .send('One Night Ultimate Werewolf API is running. Build the client with `npm run build`.');
  });
}

// ---------------------------------------------------------------------------
// Socket wiring
// ---------------------------------------------------------------------------

function fail(socket: TypedSocket, payload: ErrorPayload): void {
  socket.emit('game:error', payload);
}

/** Resolve the room and player a socket is bound to, if any. */
function context(socket: TypedSocket): { room: Room; playerId: string } | null {
  const { roomCode, playerId } = socket.data;
  if (!roomCode || !playerId) return null;
  const room = manager.get(roomCode);
  if (!room) return null;
  if (!room.findPlayer(playerId)) return null;
  return { room, playerId };
}

/** Run a handler that needs a live room + seated player, reporting failures. */
function inRoom(socket: TypedSocket, fn: (room: Room, playerId: string) => ErrorPayload | null | void) {
  const ctx = context(socket);
  if (!ctx) {
    fail(socket, { code: 'room_not_found', message: 'You are not in a game right now.' });
    return;
  }
  try {
    const err = fn(ctx.room, ctx.playerId);
    if (err) fail(socket, err);
  } catch (err) {
    console.error('[socket] handler failed:', err);
    fail(socket, { code: 'internal', message: 'Something went wrong on the server.' });
  }
}

function seat(socket: TypedSocket, room: Room, playerId: string, token: string): JoinedPayload {
  socket.data.roomCode = room.code;
  socket.data.playerId = playerId;
  socket.join(room.channel);
  return { playerId, token, roomCode: room.code };
}

io.on('connection', (socket: TypedSocket) => {
  socket.on('room:create', (payload, ack) => {
    const name = sanitizeName(payload?.name);
    if (!name) {
      ack({ error: { code: 'invalid_name', message: 'Enter a name (1-16 characters).' } });
      return;
    }

    const room = manager.create();
    const result = room.addHuman(name, socket.id, payload?.tutorial === true);
    if ('code' in result) {
      manager.destroy(room.code);
      ack({ error: result });
      return;
    }
    if (payload?.config) room.updateConfig(payload.config);

    ack(seat(socket, room, result.id, result.token));
    room.broadcast();
    console.log(`[room ${room.code}] created by ${name}`);
  });

  socket.on('room:join', (payload, ack) => {
    const code = normalizeCode(payload?.code);
    const name = sanitizeName(payload?.name);
    if (!code) {
      ack({ error: { code: 'room_not_found', message: 'Enter a 4-character room code.' } });
      return;
    }
    if (!name) {
      ack({ error: { code: 'invalid_name', message: 'Enter a name (1-16 characters).' } });
      return;
    }
    const room = manager.get(code);
    if (!room) {
      ack({ error: { code: 'room_not_found', message: `No game found with code ${code}.` } });
      return;
    }

    const result = room.addHuman(name, socket.id, payload?.tutorial === true);
    if ('code' in result) {
      ack({ error: result });
      return;
    }
    ack(seat(socket, room, result.id, result.token));
    room.broadcast();
  });

  socket.on('room:rejoin', (payload, ack) => {
    const code = normalizeCode(payload?.code);
    const room = code ? manager.get(code) : undefined;
    const player = room && payload?.playerId ? room.findPlayer(payload.playerId) : undefined;

    // A stale token or a room that has since been reclaimed both land here; the
    // client falls back to the join screen.
    if (!room || !player || player.isBot || player.token !== payload?.token) {
      ack({ error: { code: 'rejoin_failed', message: 'That seat is no longer available.' } });
      return;
    }

    room.attachSocket(player.id, socket.id);
    ack(seat(socket, room, player.id, player.token));
    room.resyncPrivate(player);
    room.broadcast();
  });

  socket.on('room:leave', () => {
    const ctx = context(socket);
    if (!ctx) return;
    const { room, playerId } = ctx;
    room.removePlayer(playerId);
    socket.leave(room.channel);
    socket.data.roomCode = undefined;
    socket.data.playerId = undefined;
    room.broadcast();
    manager.destroyIfAbandoned(room.code);
  });

  socket.on('room:addBot', () => {
    inRoom(socket, (room, playerId) => {
      if (!room.isHost(playerId)) {
        return { code: 'not_host', message: 'Only the host can add bots.' };
      }
      const err = room.addBot();
      room.broadcast();
      return err;
    });
  });

  socket.on('room:removeBot', (payload) => {
    inRoom(socket, (room, playerId) => {
      if (!room.isHost(playerId)) {
        return { code: 'not_host', message: 'Only the host can remove bots.' };
      }
      const bot = room.findPlayer(payload?.playerId ?? '');
      if (!bot || !bot.isBot) {
        return { code: 'bad_action', message: 'That is not a bot.' };
      }
      room.removePlayer(bot.id);
      room.broadcast();
      return null;
    });
  });

  socket.on('room:kick', (payload) => {
    inRoom(socket, (room, playerId) => {
      if (!room.isHost(playerId)) {
        return { code: 'not_host', message: 'Only the host can remove players.' };
      }
      if (room.phase !== 'lobby') {
        return { code: 'bad_phase', message: 'Players can only be removed in the lobby.' };
      }
      const target = room.findPlayer(payload?.playerId ?? '');
      if (!target || target.id === playerId) {
        return { code: 'bad_action', message: 'Pick another player to remove.' };
      }
      if (target.socketId) {
        io.sockets.sockets.get(target.socketId)?.leave(room.channel);
      }
      room.removePlayer(target.id);
      room.broadcast();
      return null;
    });
  });

  socket.on('room:config', (payload) => {
    inRoom(socket, (room, playerId) => {
      if (!room.isHost(playerId)) {
        return { code: 'not_host', message: 'Only the host can change settings.' };
      }
      if (room.phase !== 'lobby') {
        return { code: 'bad_phase', message: 'Settings are locked once the game starts.' };
      }
      room.updateConfig(payload?.config);
      room.broadcast();
      return null;
    });
  });

  socket.on('room:start', () => {
    inRoom(socket, (room, playerId) => {
      const err = room.start(playerId);
      if (err) return err;
      console.log(`[room ${room.code}] round started with ${room.players.length} players`);
      return null;
    });
  });

  socket.on('player:ready', (payload) => {
    inRoom(socket, (room, playerId) => {
      room.setReady(playerId, payload?.ready !== false);
      return null;
    });
  });

  socket.on('night:action', (payload) => {
    inRoom(socket, (room, playerId) => {
      const stepIndex = payload?.stepIndex;
      const action = payload?.action as NightAction | undefined;
      if (typeof stepIndex !== 'number' || !action || typeof action.type !== 'string') {
        return { code: 'bad_action', message: 'Malformed action.' };
      }
      return room.submitNightAction(playerId, stepIndex, action);
    });
  });

  socket.on('vote:cast', (payload) => {
    inRoom(socket, (room, playerId) => {
      if (typeof payload?.targetId !== 'string') {
        return { code: 'bad_action', message: 'Pick someone to vote for.' };
      }
      return room.castVote(playerId, payload.targetId);
    });
  });

  socket.on('game:playAgain', () => {
    inRoom(socket, (room, playerId) => room.playAgain(playerId));
  });

  socket.on('tutorial:set', (payload) => {
    inRoom(socket, (room, playerId) => {
      room.setTutorial(playerId, payload?.enabled === true);
      return null;
    });
  });

  socket.on('disconnect', (reason) => {
    const ctx = context(socket);
    if (!ctx) return;
    const { room, playerId } = ctx;
    // Ignore a stale socket for a seat that has already been reclaimed by a
    // newer connection (common on mobile backgrounding).
    if (room.findPlayer(playerId)?.socketId !== socket.id) return;

    room.handleDisconnect(playerId);
    room.broadcast();
    if (room.humanCount === 0) manager.destroyIfAbandoned(room.code);
    console.log(`[room ${room.code}] player disconnected (${reason})`);
  });
});

server.listen(PORT, () => {
  console.log(`One Night Ultimate Werewolf listening on :${PORT}`);
  if (!fs.existsSync(clientDist)) {
    console.log('Client bundle not found — run `npm run build` for the full app.');
  }
});

function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down.`);
  manager.stopSweeper();
  io.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
