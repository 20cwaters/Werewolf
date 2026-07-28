import { randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';
import {
  CENTER_COUNT,
  MAX_PLAYERS,
  MIN_PLAYERS,
  NightActionError,
  ROLES,
  applyNightAction,
  autoNightAction,
  buildDeck,
  buildNightSequence,
  buildNightTurn,
  cardAt,
  centerCards,
  countTotal,
  dealCards,
  defaultConfig,
  evaluateOutcome,
  mergeConfig,
  phantomStepLog,
  pick,
  playerCards,
  roleName,
  suggestRoleCounts,
  totalCardsFor,
  validateRoleCounts,
  type CardMap,
  type ClientToServerEvents,
  type ErrorPayload,
  type GameResult,
  type JournalEntry,
  type NightAction,
  type NightLogEntry,
  type NightStep,
  type Phase,
  type PublicPlayer,
  type PublicRoomState,
  type RoleId,
  type RoomConfig,
  type ServerToClientEvents,
  type VoteRecord,
} from '@onuw/shared';
import {
  botThinkDelay,
  decideBotNightAction,
  decideBotVote,
  newBotMemory,
  rememberResult,
  rememberTurn,
  type BotMemory,
} from './bots';
import { nextBotName } from './names';

export type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

/** How long a dropped player's action is waited on before auto-resolving. */
const DISCONNECT_GRACE_MS = 2000;
/** Pause after a step fully resolves, so reveals do not vanish instantly. */
const STEP_SETTLE_MS = 1200;
/** Range for a decoy step nobody is awake for. */
const DECOY_MIN_MS = 3500;
const DECOY_MAX_MS = 7000;

export interface ServerPlayer {
  id: string;
  name: string;
  isBot: boolean;
  /** Secret for reclaiming this seat after a refresh. */
  token: string;
  socketId: string | null;
  connected: boolean;
  ready: boolean;
  tutorial: boolean;
  // ---- per-round state ----
  journal: JournalEntry[];
  vote: string | null;
  botMemory: BotMemory | null;
}

export class Room {
  readonly code: string;
  private readonly io: TypedServer;

  players: ServerPlayer[] = [];
  hostId = '';
  phase: Phase = 'lobby';
  config: RoomConfig;
  lastActivity = Date.now();

  // ---- round state ----
  private deck: RoleId[] | null = null;
  private cards: CardMap = {};
  private originalRoles: Record<string, RoleId> = {};
  private originalCenterCards: RoleId[] = [];
  private steps: NightStep[] = [];
  private stepIndex = -1;
  private pendingActors = new Set<string>();
  private nightLog: NightLogEntry[] = [];
  private results: GameResult | null = null;

  private revealEndsAt: number | null = null;
  private nightEndsAt = 0;
  private dayEndsAt: number | null = null;
  private voteEndsAt: number | null = null;

  private phaseTimer: NodeJS.Timeout | null = null;
  private actorTimers = new Map<string, NodeJS.Timeout>();

  constructor(code: string, io: TypedServer) {
    this.code = code;
    this.io = io;
    this.config = defaultConfig(MIN_PLAYERS);
  }

  // =========================================================================
  // Roster
  // =========================================================================

  get channel(): string {
    return `room:${this.code}`;
  }

  get humanCount(): number {
    return this.players.filter((p) => !p.isBot).length;
  }

  get connectedHumanCount(): number {
    return this.players.filter((p) => !p.isBot && p.connected).length;
  }

  get isEmpty(): boolean {
    return this.humanCount === 0;
  }

  findPlayer(playerId: string): ServerPlayer | undefined {
    return this.players.find((p) => p.id === playerId);
  }

  private nameTaken(name: string): boolean {
    return this.players.some((p) => p.name.toLowerCase() === name.toLowerCase());
  }

  addHuman(name: string, socketId: string, tutorial: boolean): ServerPlayer | ErrorPayload {
    if (this.phase !== 'lobby') {
      return { code: 'bad_phase', message: 'That game is already in progress.' };
    }
    if (this.players.length >= MAX_PLAYERS) {
      return { code: 'room_full', message: `That room is full (${MAX_PLAYERS} players max).` };
    }
    if (this.nameTaken(name)) {
      return { code: 'name_taken', message: 'Someone at the table already uses that name.' };
    }

    const player: ServerPlayer = {
      id: randomUUID(),
      name,
      isBot: false,
      token: randomUUID(),
      socketId,
      connected: true,
      ready: false,
      tutorial,
      journal: [],
      vote: null,
      botMemory: null,
    };
    this.players.push(player);
    if (!this.hostId) this.hostId = player.id;
    this.reconcileDeck();
    this.touch();
    return player;
  }

  addBot(): ErrorPayload | null {
    if (this.phase !== 'lobby') {
      return { code: 'bad_phase', message: 'Bots can only be added in the lobby.' };
    }
    if (this.players.length >= MAX_PLAYERS) {
      return { code: 'room_full', message: `The table is full (${MAX_PLAYERS} players max).` };
    }
    this.players.push({
      id: randomUUID(),
      name: nextBotName(this.players.map((p) => p.name)),
      isBot: true,
      token: randomUUID(),
      socketId: null,
      connected: true,
      ready: true,
      tutorial: false,
      journal: [],
      vote: null,
      botMemory: null,
    });
    this.reconcileDeck();
    this.touch();
    return null;
  }

  removePlayer(playerId: string): void {
    this.players = this.players.filter((p) => p.id !== playerId);
    this.clearActorTimer(playerId);
    this.pendingActors.delete(playerId);
    if (this.hostId === playerId) this.reassignHost();
    if (this.phase === 'lobby') this.reconcileDeck();
    this.touch();
  }

  private reassignHost(): void {
    const next =
      this.players.find((p) => !p.isBot && p.connected) ??
      this.players.find((p) => !p.isBot) ??
      this.players[0];
    this.hostId = next?.id ?? '';
  }

  isHost(playerId: string): boolean {
    return this.hostId === playerId;
  }

  attachSocket(playerId: string, socketId: string): void {
    const player = this.findPlayer(playerId);
    if (!player) return;
    player.socketId = socketId;
    player.connected = true;
    this.clearActorTimer(playerId);
    this.touch();
  }

  /**
   * A player dropped. In the lobby they simply leave; mid-game the seat is kept
   * so they can reconnect, and anything the table is waiting on for them is
   * auto-resolved shortly so the round never stalls.
   */
  handleDisconnect(playerId: string): void {
    const player = this.findPlayer(playerId);
    if (!player) return;
    player.socketId = null;
    player.connected = false;

    if (this.phase === 'lobby') {
      this.removePlayer(playerId);
      return;
    }

    if (this.hostId === playerId) this.reassignHost();

    if (this.phase === 'night' && this.pendingActors.has(playerId)) {
      this.scheduleActorTimer(playerId, DISCONNECT_GRACE_MS, () => this.autoResolveActor(playerId));
    }
    if (this.phase === 'voting' && !player.vote) {
      this.scheduleActorTimer(playerId, DISCONNECT_GRACE_MS, () => this.autoVote(playerId));
    }
    if (this.phase === 'reveal' || this.phase === 'day') {
      // A dropped player must not hold up a ready-gate.
      this.maybeAdvanceOnReady();
    }
    this.touch();
  }

  touch(): void {
    this.lastActivity = Date.now();
  }

  // =========================================================================
  // Config
  // =========================================================================

  updateConfig(patch: unknown): void {
    this.config = mergeConfig(this.config, patch);
    this.touch();
  }

  /**
   * Keep the deck the right size as the roster changes, preserving the host's
   * picks where possible by flexing the Villager count first.
   */
  private reconcileDeck(): void {
    const count = this.players.length;
    if (count < MIN_PLAYERS) return;

    const target = totalCardsFor(count);
    const counts = { ...this.config.roleCounts };
    const diff = target - countTotal(counts);

    if (diff > 0) {
      counts.villager = (counts.villager ?? 0) + diff;
    } else if (diff < 0) {
      const removable = Math.min(-diff, counts.villager ?? 0);
      if (removable > 0) counts.villager = (counts.villager ?? 0) - removable;
      if (countTotal(counts) !== target) {
        // Cannot rescue the host's deck by trimming Villagers alone.
        this.config.roleCounts = suggestRoleCounts(count);
        return;
      }
    }
    if (counts.villager === 0) delete counts.villager;
    this.config.roleCounts = counts;
  }

  deckValidation() {
    return validateRoleCounts(this.config.roleCounts, this.players.length);
  }

  // =========================================================================
  // Public state
  // =========================================================================

  publicPlayers(): PublicPlayer[] {
    return this.players.map((p, seat) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      isHost: p.id === this.hostId,
      connected: p.connected,
      ready: p.ready,
      seat,
    }));
  }

  publicState(): PublicRoomState {
    const step = this.currentStep();
    return {
      code: this.code,
      phase: this.phase,
      players: this.publicPlayers(),
      config: this.config,
      hostId: this.hostId,
      deck: this.deck,
      night:
        this.phase === 'night' && step
          ? {
              stepIndex: step.index,
              totalSteps: this.steps.length,
              // Naming the role is a host setting. Who holds it is never sent.
              roleId: this.config.announceNightRoles ? step.role : null,
              endsAt: this.nightEndsAt,
            }
          : null,
      day: this.phase === 'day' && this.dayEndsAt ? { endsAt: this.dayEndsAt } : null,
      voting:
        this.phase === 'voting' && this.voteEndsAt
          ? {
              endsAt: this.voteEndsAt,
              // Who has voted is public; what they voted is not.
              votedIds: this.players.filter((p) => p.vote).map((p) => p.id),
            }
          : null,
      results: this.results,
      revealEndsAt: this.phase === 'reveal' ? this.revealEndsAt : null,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
    };
  }

  broadcast(): void {
    this.io.to(this.channel).emit('room:state', this.publicState());
  }

  private emitTo<E extends keyof ServerToClientEvents>(
    player: ServerPlayer,
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void {
    if (player.isBot || !player.socketId) return;
    this.io.to(player.socketId).emit(event, ...args);
  }

  private addJournal(player: ServerPlayer, text: string, revealed: JournalEntry['revealed'] = []) {
    player.journal.push({ id: randomUUID(), at: Date.now(), text, revealed });
    this.emitTo(player, 'journal:set', player.journal);
  }

  /** Re-send every private payload a returning player is entitled to. */
  resyncPrivate(player: ServerPlayer): void {
    this.emitTo(player, 'room:state', this.publicState());
    if (this.deck && this.originalRoles[player.id]) {
      this.emitTo(player, 'role:dealt', {
        role: this.originalRoles[player.id],
        deck: this.deck,
      });
    }
    if (player.journal.length > 0) this.emitTo(player, 'journal:set', player.journal);
    if (this.phase === 'voting' && player.vote) {
      this.emitTo(player, 'vote:ack', { targetId: player.vote });
    }
    // Mid-turn reconnect: hand back the action UI.
    const step = this.currentStep();
    if (this.phase === 'night' && step && this.pendingActors.has(player.id)) {
      this.emitTo(
        player,
        'night:turn',
        buildNightTurn(this.nightCtx(), step, player.id, this.steps.length, this.nightEndsAt)
      );
    }
  }

  // =========================================================================
  // Timers
  // =========================================================================

  private setPhaseTimer(ms: number, fn: () => void): void {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phaseTimer = setTimeout(() => {
      this.phaseTimer = null;
      try {
        fn();
      } catch (err) {
        console.error(`[room ${this.code}] phase timer failed:`, err);
      }
    }, ms);
  }

  private scheduleActorTimer(playerId: string, ms: number, fn: () => void): void {
    this.clearActorTimer(playerId);
    this.actorTimers.set(
      playerId,
      setTimeout(() => {
        this.actorTimers.delete(playerId);
        try {
          fn();
        } catch (err) {
          console.error(`[room ${this.code}] actor timer failed:`, err);
        }
      }, ms)
    );
  }

  private clearActorTimer(playerId: string): void {
    const timer = this.actorTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.actorTimers.delete(playerId);
    }
  }

  private clearTimers(): void {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phaseTimer = null;
    for (const timer of this.actorTimers.values()) clearTimeout(timer);
    this.actorTimers.clear();
  }

  dispose(): void {
    this.clearTimers();
  }

  // =========================================================================
  // Starting a round
  // =========================================================================

  start(playerId: string): ErrorPayload | null {
    if (!this.isHost(playerId)) {
      return { code: 'not_host', message: 'Only the host can start the game.' };
    }
    if (this.phase !== 'lobby') {
      return { code: 'bad_phase', message: 'The game has already started.' };
    }
    if (this.players.length < MIN_PLAYERS) {
      return {
        code: 'bad_config',
        message: `You need at least ${MIN_PLAYERS} players — add bots to fill the table.`,
      };
    }
    const validation = this.deckValidation();
    if (!validation.ok) {
      return { code: 'bad_config', message: validation.errors.join(' ') };
    }

    const deck = buildDeck(this.config.roleCounts);
    const playerIds = this.players.map((p) => p.id);
    const deal = dealCards(deck, playerIds);

    this.deck = deck;
    this.cards = deal.cards;
    this.originalRoles = deal.originalRoles;
    this.originalCenterCards = deal.originalCenterCards;
    this.steps = buildNightSequence(deck, deal.originalRoles, playerIds);
    this.stepIndex = -1;
    this.pendingActors.clear();
    this.nightLog = [];
    this.results = null;

    for (const player of this.players) {
      player.journal = [];
      player.vote = null;
      player.ready = player.isBot;
      player.botMemory = player.isBot ? newBotMemory(this.originalRoles[player.id]) : null;
    }

    this.beginReveal();
    return null;
  }

  private beginReveal(): void {
    this.clearTimers();
    this.phase = 'reveal';
    this.revealEndsAt = Date.now() + this.config.revealSeconds * 1000;

    for (const player of this.players) {
      const role = this.originalRoles[player.id];
      this.emitTo(player, 'role:dealt', { role, deck: this.deck ?? [] });
      this.addJournal(player, `You were dealt the ${roleName(role)}.`, [
        { position: { kind: 'player', playerId: player.id }, label: 'You', role },
      ]);
    }

    this.broadcast();
    this.setPhaseTimer(this.config.revealSeconds * 1000, () => this.beginNight());
  }

  // =========================================================================
  // Night
  // =========================================================================

  private nightCtx() {
    return {
      players: this.players.map((p) => ({ id: p.id, name: p.name })),
      cards: this.cards,
      originalRoles: this.originalRoles,
    };
  }

  private currentStep(): NightStep | null {
    return this.steps[this.stepIndex] ?? null;
  }

  private beginNight(): void {
    this.clearTimers();
    this.phase = 'night';
    this.stepIndex = -1;
    this.advanceNight();
  }

  private advanceNight(): void {
    this.clearTimers();
    this.stepIndex += 1;

    const step = this.currentStep();
    if (!step) {
      this.beginDay();
      return;
    }

    this.pendingActors = new Set(step.actorIds);

    // A step whose every card sits in the center still runs, with a decoy delay
    // so its brevity does not reveal that nobody was awake for it.
    if (step.actorIds.length === 0) {
      const decoy = Math.round(DECOY_MIN_MS + Math.random() * (DECOY_MAX_MS - DECOY_MIN_MS));
      this.nightEndsAt = Date.now() + decoy;
      this.nightLog.push(phantomStepLog(step));
      this.broadcast();
      this.setPhaseTimer(decoy, () => this.advanceNight());
      return;
    }

    this.nightEndsAt = Date.now() + this.config.nightActionSeconds * 1000;
    this.broadcast();

    const ctx = this.nightCtx();
    for (const actorId of step.actorIds) {
      const actor = this.findPlayer(actorId);
      if (!actor) {
        this.pendingActors.delete(actorId);
        continue;
      }
      const turn = buildNightTurn(ctx, step, actorId, this.steps.length, this.nightEndsAt);

      if (actor.isBot) {
        if (actor.botMemory) rememberTurn(actor.botMemory, turn);
        this.scheduleActorTimer(actorId, botThinkDelay(), () => this.runBotNightAction(actorId));
        continue;
      }

      this.emitTo(actor, 'night:turn', turn);
      if (!actor.connected) {
        this.scheduleActorTimer(actorId, DISCONNECT_GRACE_MS, () => this.autoResolveActor(actorId));
      }
    }

    // Hard deadline: anyone who has not acted gets auto-resolved.
    this.setPhaseTimer(this.config.nightActionSeconds * 1000, () => {
      for (const actorId of Array.from(this.pendingActors)) this.autoResolveActor(actorId, false);
      this.finishStepIfDone(true);
    });
  }

  submitNightAction(playerId: string, stepIndex: number, action: NightAction): ErrorPayload | null {
    if (this.phase !== 'night') {
      return { code: 'bad_phase', message: 'It is not night.' };
    }
    const step = this.currentStep();
    if (!step || step.index !== stepIndex) {
      return { code: 'bad_action', message: 'That night step has already passed.' };
    }
    if (!this.pendingActors.has(playerId)) {
      return { code: 'bad_action', message: 'You have already acted, or it is not your turn.' };
    }
    const player = this.findPlayer(playerId);
    if (!player) return { code: 'internal', message: 'Player not found.' };

    try {
      this.applyActorAction(player, step, action);
    } catch (err) {
      if (err instanceof NightActionError) {
        return { code: 'bad_action', message: err.message };
      }
      throw err;
    }
    this.finishStepIfDone();
    return null;
  }

  private applyActorAction(player: ServerPlayer, step: NightStep, action: NightAction): void {
    const { result, log } = applyNightAction(this.nightCtx(), step, player.id, action);

    this.pendingActors.delete(player.id);
    this.clearActorTimer(player.id);
    this.nightLog.push(log);

    if (player.isBot) {
      if (player.botMemory) rememberResult(player.botMemory, result);
      return;
    }

    this.emitTo(player, 'night:result', result);
    this.addJournal(player, result.message, result.revealed);
  }

  private runBotNightAction(actorId: string): void {
    const step = this.currentStep();
    const bot = this.findPlayer(actorId);
    if (!step || !bot || !bot.botMemory || !this.pendingActors.has(actorId)) return;

    const action = decideBotNightAction(
      step,
      actorId,
      bot.botMemory,
      this.players.map((p) => p.id)
    );
    try {
      this.applyActorAction(bot, step, action);
    } catch (err) {
      // A bot should never produce an illegal action; fall back rather than
      // wedging the round if it somehow does.
      console.error(`[room ${this.code}] bot action rejected, falling back:`, err);
      this.applyActorAction(bot, step, autoNightAction(step));
    }
    this.finishStepIfDone();
  }

  /** Resolve a step for an actor who timed out or dropped. */
  private autoResolveActor(actorId: string, thenAdvance = true): void {
    const step = this.currentStep();
    const player = this.findPlayer(actorId);
    if (!step || !player || !this.pendingActors.has(actorId)) return;
    this.applyActorAction(player, step, autoNightAction(step));
    if (thenAdvance) this.finishStepIfDone();
  }

  private finishStepIfDone(immediate = false): void {
    if (this.pendingActors.size > 0) {
      this.broadcast();
      return;
    }
    this.broadcast();
    this.setPhaseTimer(immediate ? 0 : STEP_SETTLE_MS, () => this.advanceNight());
  }

  // =========================================================================
  // Day
  // =========================================================================

  private beginDay(): void {
    this.clearTimers();
    this.phase = 'day';
    this.dayEndsAt = Date.now() + this.config.discussionSeconds * 1000;
    for (const player of this.players) player.ready = player.isBot;
    this.broadcast();
    this.setPhaseTimer(this.config.discussionSeconds * 1000, () => this.beginVoting());
  }

  setReady(playerId: string, ready: boolean): void {
    if (this.phase !== 'reveal' && this.phase !== 'day') return;
    const player = this.findPlayer(playerId);
    if (!player) return;
    player.ready = ready;
    this.touch();
    this.broadcast();
    this.maybeAdvanceOnReady();
  }

  /** Skip the rest of a reveal or discussion once everyone present is ready. */
  private maybeAdvanceOnReady(): void {
    const waitingOn = this.players.filter((p) => !p.isBot && p.connected && !p.ready);
    if (waitingOn.length > 0) return;
    if (this.phase === 'reveal') this.beginNight();
    else if (this.phase === 'day') this.beginVoting();
  }

  // =========================================================================
  // Voting
  // =========================================================================

  private beginVoting(): void {
    this.clearTimers();
    this.phase = 'voting';
    this.voteEndsAt = Date.now() + this.config.voteSeconds * 1000;
    for (const player of this.players) player.vote = null;
    this.broadcast();

    const ids = this.players.map((p) => p.id);
    for (const player of this.players) {
      if (player.isBot && player.botMemory) {
        const memory = player.botMemory;
        this.scheduleActorTimer(player.id, botThinkDelay(undefined, 1500, 4500), () => {
          if (this.phase !== 'voting' || player.vote) return;
          this.castVote(player.id, decideBotVote(player.id, memory, ids));
        });
      } else if (!player.connected) {
        this.scheduleActorTimer(player.id, DISCONNECT_GRACE_MS, () => this.autoVote(player.id));
      }
    }

    this.setPhaseTimer(this.config.voteSeconds * 1000, () => {
      for (const player of this.players) if (!player.vote) this.autoVote(player.id, false);
      this.finishVoting();
    });
  }

  castVote(playerId: string, targetId: string): ErrorPayload | null {
    if (this.phase !== 'voting') {
      return { code: 'bad_phase', message: 'Voting is not open.' };
    }
    const player = this.findPlayer(playerId);
    if (!player) return { code: 'internal', message: 'Player not found.' };
    if (!this.findPlayer(targetId)) {
      return { code: 'bad_action', message: 'That player is not in this game.' };
    }

    // Votes stay private until the simultaneous reveal — only the fact that a
    // vote was cast is broadcast.
    player.vote = targetId;
    this.clearActorTimer(playerId);
    this.emitTo(player, 'vote:ack', { targetId });
    this.touch();
    this.broadcast();

    if (this.players.every((p) => p.vote)) {
      this.setPhaseTimer(700, () => this.finishVoting());
    }
    return null;
  }

  private autoVote(playerId: string, thenFinish = true): void {
    if (this.phase !== 'voting') return;
    const player = this.findPlayer(playerId);
    if (!player || player.vote) return;
    const others = this.players.filter((p) => p.id !== playerId).map((p) => p.id);
    player.vote = others.length > 0 ? pick(others) : playerId;
    this.broadcast();
    if (thenFinish && this.players.every((p) => p.vote)) this.finishVoting();
  }

  private finishVoting(): void {
    if (this.phase !== 'voting') return;
    this.clearTimers();

    const votes: VoteRecord[] = this.players
      .filter((p) => p.vote)
      .map((p) => ({ voterId: p.id, targetId: p.vote as string }));

    const playerIds = this.players.map((p) => p.id);
    const finalRoles = playerCards(this.cards, playerIds);

    this.results = evaluateOutcome({
      players: this.players.map((p) => ({ id: p.id, name: p.name })),
      finalRoles,
      votes,
      originalRoles: this.originalRoles,
      centerCards: centerCards(this.cards),
      originalCenterCards: this.originalCenterCards,
      nightLog: this.nightLog,
    });

    this.phase = 'results';
    this.io.to(this.channel).emit('game:results', this.results);
    this.broadcast();
    this.touch();
  }

  // =========================================================================
  // Replay
  // =========================================================================

  playAgain(playerId: string): ErrorPayload | null {
    if (!this.isHost(playerId)) {
      return { code: 'not_host', message: 'Only the host can start a new round.' };
    }
    if (this.phase !== 'results') {
      return { code: 'bad_phase', message: 'Finish this round first.' };
    }
    this.clearTimers();
    this.phase = 'lobby';
    this.deck = null;
    this.cards = {};
    this.originalRoles = {};
    this.originalCenterCards = [];
    this.steps = [];
    this.stepIndex = -1;
    this.pendingActors.clear();
    this.nightLog = [];
    this.results = null;
    this.revealEndsAt = null;
    this.dayEndsAt = null;
    this.voteEndsAt = null;

    // Drop players who never came back, then re-check the deck size.
    this.players = this.players.filter((p) => p.isBot || p.connected);
    for (const player of this.players) {
      player.ready = player.isBot;
      player.vote = null;
      player.journal = [];
      player.botMemory = null;
    }
    if (!this.findPlayer(this.hostId)) this.reassignHost();
    this.reconcileDeck();
    this.broadcast();
    this.touch();
    return null;
  }

  setTutorial(playerId: string, enabled: boolean): void {
    const player = this.findPlayer(playerId);
    if (player) player.tutorial = enabled;
  }

  // Kept for diagnostics — the center is never exposed to clients mid-round.
  debugCenter(): RoleId[] {
    return Array.from({ length: CENTER_COUNT }, (_, i) =>
      cardAt(this.cards, { kind: 'center', index: i })
    );
  }

  debugRoleNames(): string[] {
    return this.players.map((p) => `${p.name}:${ROLES[this.originalRoles[p.id]]?.name ?? '?'}`);
  }
}
