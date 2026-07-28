import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import type {
  ErrorPayload,
  GameResult,
  JournalEntry,
  NightAction,
  NightActionResult,
  NightTurn,
  PublicPlayer,
  PublicRoomState,
  RoleId,
  RoomConfig,
} from '@onuw/shared';
import {
  clearSession,
  codeFromUrl,
  loadName,
  loadSession,
  saveName,
  saveSession,
  socket,
  type StoredSession,
} from './socket';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface GameState {
  connected: boolean;
  /** True until the initial rejoin attempt settles, so we don't flash the join page. */
  restoring: boolean;
  session: StoredSession | null;
  room: PublicRoomState | null;
  /** The card this player was dealt. Never anyone else's. */
  dealtRole: RoleId | null;
  deck: RoleId[];
  /** Best current knowledge of own card, updated by Robber/Insomniac reveals. */
  knownRole: RoleId | null;
  turn: NightTurn | null;
  actionResult: NightActionResult | null;
  journal: JournalEntry[];
  results: GameResult | null;
  myVote: string | null;
  error: ErrorPayload | null;
  notice: string | null;
  tutorial: boolean;
  joinCode: string;
  savedName: string;
}

type Action =
  | { type: 'connected'; value: boolean }
  | { type: 'restored' }
  | { type: 'session'; session: StoredSession | null }
  | { type: 'room'; room: PublicRoomState }
  | { type: 'dealt'; role: RoleId; deck: RoleId[] }
  | { type: 'turn'; turn: NightTurn }
  | { type: 'actionResult'; result: NightActionResult }
  | { type: 'dismissResult' }
  | { type: 'journal'; entries: JournalEntry[] }
  | { type: 'results'; results: GameResult }
  | { type: 'vote'; targetId: string }
  | { type: 'error'; error: ErrorPayload | null }
  | { type: 'notice'; notice: string | null }
  | { type: 'tutorial'; enabled: boolean }
  | { type: 'joinCode'; code: string }
  | { type: 'name'; name: string }
  | { type: 'leave' };

const initialState: GameState = {
  connected: false,
  restoring: true,
  session: null,
  room: null,
  dealtRole: null,
  deck: [],
  knownRole: null,
  turn: null,
  actionResult: null,
  journal: [],
  results: null,
  myVote: null,
  error: null,
  notice: null,
  tutorial: false,
  joinCode: codeFromUrl(),
  savedName: loadName(),
};

/** Per-round private state, cleared whenever a new round begins. */
function clearedRound(): Partial<GameState> {
  return {
    dealtRole: null,
    knownRole: null,
    turn: null,
    actionResult: null,
    journal: [],
    results: null,
    myVote: null,
  };
}

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'connected':
      return { ...state, connected: action.value };

    case 'restored':
      return { ...state, restoring: false };

    case 'session':
      return { ...state, session: action.session, restoring: false };

    case 'room': {
      const next: GameState = { ...state, room: action.room };
      // Returning to the lobby means a fresh round: drop stale private data.
      if (action.room.phase === 'lobby' && state.room && state.room.phase !== 'lobby') {
        Object.assign(next, clearedRound());
      }
      // Leaving the night clears any lingering action UI.
      if (action.room.phase !== 'night') next.turn = null;
      return next;
    }

    case 'dealt':
      return { ...state, dealtRole: action.role, knownRole: action.role, deck: action.deck };

    case 'turn':
      return { ...state, turn: action.turn, actionResult: null };

    case 'actionResult':
      return {
        ...state,
        turn: null,
        actionResult: action.result,
        // The Drunk gets no ownRole, which is exactly the point.
        knownRole: action.result.ownRole ?? state.knownRole,
      };

    case 'dismissResult':
      return { ...state, actionResult: null };

    case 'journal':
      return { ...state, journal: action.entries };

    case 'results':
      return { ...state, results: action.results, turn: null };

    case 'vote':
      return { ...state, myVote: action.targetId };

    case 'error':
      return { ...state, error: action.error };

    case 'notice':
      return { ...state, notice: action.notice };

    case 'tutorial':
      return { ...state, tutorial: action.enabled };

    case 'joinCode':
      return { ...state, joinCode: action.code };

    case 'name':
      return { ...state, savedName: action.name };

    case 'leave':
      return {
        ...state,
        ...clearedRound(),
        session: null,
        room: null,
        deck: [],
        error: null,
      };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface GameApi {
  state: GameState;
  me: PublicPlayer | null;
  isHost: boolean;
  players: PublicPlayer[];
  createRoom(name: string, config: Partial<RoomConfig>, tutorial: boolean): void;
  joinRoom(code: string, name: string, tutorial: boolean): void;
  leaveRoom(): void;
  addBot(): void;
  removeBot(playerId: string): void;
  kick(playerId: string): void;
  updateConfig(config: Partial<RoomConfig>): void;
  startGame(): void;
  setReady(ready: boolean): void;
  submitAction(action: NightAction): void;
  castVote(targetId: string): void;
  playAgain(): void;
  setTutorial(enabled: boolean): void;
  dismissResult(): void;
  dismissError(): void;
  setJoinCode(code: string): void;
}

const GameContext = createContext<GameApi | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const sessionRef = useRef<StoredSession | null>(loadSession());

  // -- socket wiring -------------------------------------------------------
  useEffect(() => {
    const onConnect = () => {
      dispatch({ type: 'connected', value: true });
      const stored = sessionRef.current;
      if (!stored) {
        dispatch({ type: 'restored' });
        return;
      }
      // Reclaim the seat after a refresh, reconnect, or app backgrounding.
      const rejoin = {
        code: stored.roomCode,
        playerId: stored.playerId,
        token: stored.token,
      };
      socket.emit('room:rejoin', rejoin, (res) => {
        if ('error' in res) {
          sessionRef.current = null;
          clearSession();
          dispatch({ type: 'session', session: null });
          return;
        }
        sessionRef.current = res;
        saveSession(res);
        dispatch({ type: 'session', session: res });
      });
    };

    const onDisconnect = () => dispatch({ type: 'connected', value: false });

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:state', (room) => dispatch({ type: 'room', room }));
    socket.on('role:dealt', (p) => dispatch({ type: 'dealt', role: p.role, deck: p.deck }));
    socket.on('night:turn', (turn) => dispatch({ type: 'turn', turn }));
    socket.on('night:result', (result) => dispatch({ type: 'actionResult', result }));
    socket.on('journal:set', (entries) => dispatch({ type: 'journal', entries }));
    socket.on('vote:ack', (p) => dispatch({ type: 'vote', targetId: p.targetId }));
    socket.on('game:results', (results) => dispatch({ type: 'results', results }));
    socket.on('game:error', (error) => dispatch({ type: 'error', error }));

    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:state');
      socket.off('role:dealt');
      socket.off('night:turn');
      socket.off('night:result');
      socket.off('journal:set');
      socket.off('vote:ack');
      socket.off('game:results');
      socket.off('game:error');
    };
  }, []);

  // Keep the address bar on the room's share link so a refresh lands right.
  useEffect(() => {
    const code = state.room?.code;
    const target = code ? `/r/${code}` : '/';
    if (window.location.pathname !== target) {
      window.history.replaceState(null, '', target);
    }
  }, [state.room?.code]);

  const seatSession = useCallback((res: StoredSession) => {
    sessionRef.current = res;
    saveSession(res);
    dispatch({ type: 'session', session: res });
  }, []);

  const api = useMemo<GameApi>(() => {
    const players = state.room?.players ?? [];
    const me = players.find((p) => p.id === state.session?.playerId) ?? null;

    return {
      state,
      me,
      players,
      isHost: !!me && !!state.room && state.room.hostId === me.id,

      createRoom(name, config, tutorial) {
        saveName(name);
        dispatch({ type: 'name', name });
        socket.emit('room:create', { name, config, tutorial }, (res) => {
          if ('error' in res) {
            dispatch({ type: 'error', error: res.error });
            return;
          }
          dispatch({ type: 'tutorial', enabled: tutorial });
          seatSession(res);
        });
      },

      joinRoom(code, name, tutorial) {
        saveName(name);
        dispatch({ type: 'name', name });
        socket.emit('room:join', { code, name, tutorial }, (res) => {
          if ('error' in res) {
            dispatch({ type: 'error', error: res.error });
            return;
          }
          dispatch({ type: 'tutorial', enabled: tutorial });
          seatSession(res);
        });
      },

      leaveRoom() {
        socket.emit('room:leave');
        sessionRef.current = null;
        clearSession();
        dispatch({ type: 'leave' });
      },

      addBot: () => socket.emit('room:addBot'),
      removeBot: (playerId) => socket.emit('room:removeBot', { playerId }),
      kick: (playerId) => socket.emit('room:kick', { playerId }),
      updateConfig: (config) => socket.emit('room:config', { config }),
      startGame: () => socket.emit('room:start'),
      setReady: (ready) => socket.emit('player:ready', { ready }),

      submitAction(action) {
        const stepIndex = state.turn?.stepIndex;
        if (stepIndex === undefined) return;
        socket.emit('night:action', { stepIndex, action });
      },

      castVote: (targetId) => socket.emit('vote:cast', { targetId }),
      playAgain: () => socket.emit('game:playAgain'),

      setTutorial(enabled) {
        dispatch({ type: 'tutorial', enabled });
        socket.emit('tutorial:set', { enabled });
      },

      dismissResult: () => dispatch({ type: 'dismissResult' }),
      dismissError: () => dispatch({ type: 'error', error: null }),
      setJoinCode: (code) => dispatch({ type: 'joinCode', code }),
    };
  }, [state, seatSession]);

  return <GameContext.Provider value={api}>{children}</GameContext.Provider>;
}

export function useGame(): GameApi {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside <GameProvider>');
  return ctx;
}
