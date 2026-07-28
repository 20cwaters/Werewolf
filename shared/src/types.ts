/**
 * Shared vocabulary for the whole app: roles, card positions, night actions,
 * room state and the socket contract. The client imports these types straight
 * from source; the server imports the compiled build.
 */

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export type RoleId =
  | 'werewolf'
  | 'minion'
  | 'mason'
  | 'seer'
  | 'robber'
  | 'troublemaker'
  | 'drunk'
  | 'insomniac'
  | 'tanner'
  | 'hunter'
  | 'villager';

/** Win-condition team. The Tanner is its own team because it wins alone. */
export type Team = 'village' | 'werewolf' | 'tanner';

export interface RoleDef {
  id: RoleId;
  name: string;
  team: Team;
  /** How many copies of this card the base set contains. */
  maxCount: number;
  /** Position in the night wake order (1-based). `null` means it never wakes. */
  nightOrder: number | null;
  /** One-line summary for card faces and lobby chips. */
  blurb: string;
  /** Full ability text for the rules reference. */
  ability: string;
  /** What happens on this role's night step, or `null` if it has none. */
  nightAbility: string | null;
  /** Extra hand-holding shown when tutorial mode is on. */
  tutorial: string;
  /** Lightweight emoji card face — keeps the bundle image-free. */
  glyph: string;
}

// ---------------------------------------------------------------------------
// Card positions
// ---------------------------------------------------------------------------

/**
 * Cards live in *positions*, not on players. A position is either a player's
 * seat or one of the three center slots. Night actions move cards between
 * positions; a player's final role is whatever card sits in their position
 * when the night ends.
 */
export type CardPosition =
  | { kind: 'player'; playerId: string }
  | { kind: 'center'; index: number };

/** Serialized position, either `p:<playerId>` or `c:<index>`. */
export type PositionKey = string;

/** The authoritative card layout: position key -> role currently there. */
export type CardMap = Record<PositionKey, RoleId>;

export interface RevealedCard {
  position: CardPosition;
  /** Human label, e.g. `Casey` or `Center 2`. */
  label: string;
  role: RoleId;
}

// ---------------------------------------------------------------------------
// Night phase
// ---------------------------------------------------------------------------

/** Shape of the choice a role's night step asks its actor to make. */
export type ChoiceKind =
  | 'none'
  | 'werewolf_lone_center'
  | 'seer'
  | 'robber'
  | 'troublemaker'
  | 'drunk';

export type NightAction =
  | { type: 'skip' }
  | { type: 'acknowledge' }
  | { type: 'werewolf_center'; center: number }
  | { type: 'seer_player'; targetId: string }
  | { type: 'seer_center'; centers: number[] }
  | { type: 'robber_rob'; targetId: string }
  | { type: 'troublemaker_swap'; targetIds: string[] }
  | { type: 'drunk_swap'; center: number };

export interface NightStep {
  /** 0-based index into the night sequence. */
  index: number;
  role: RoleId;
  /**
   * Players who were *dealt* this role and therefore act on this step. May be
   * empty when every copy of the card sits in the center — the step still runs
   * (with a decoy delay) so its absence does not leak information.
   */
  actorIds: string[];
  choiceKind: ChoiceKind;
  /** Drunk must swap; every other choice may be declined. */
  mandatory: boolean;
}

export interface NightLogEntry {
  stepIndex: number;
  role: RoleId;
  text: string;
}

/** Private payload handed to the one player (or pair) whose turn it is. */
export interface NightTurn {
  stepIndex: number;
  totalSteps: number;
  role: RoleId;
  choiceKind: ChoiceKind;
  mandatory: boolean;
  endsAt: number;
  /** Fellow werewolves / masons, or the werewolves the Minion is shown. */
  peers: { id: string; name: string }[];
  peersLabel: string | null;
  /** Cards revealed before any choice is made (none in the base set). */
  revealed: RevealedCard[];
  /** Player ids this action is allowed to target. */
  targetablePlayerIds: string[];
  headline: string;
  instruction: string;
}

export interface NightActionResult {
  stepIndex: number;
  role: RoleId;
  revealed: RevealedCard[];
  /** New knowledge about the player's own card, when the action grants it. */
  ownRole: RoleId | null;
  message: string;
}

/** Running record of everything a single player has privately learned. */
export interface JournalEntry {
  id: string;
  at: number;
  text: string;
  revealed: RevealedCard[];
}

// ---------------------------------------------------------------------------
// Voting and results
// ---------------------------------------------------------------------------

export interface VoteRecord {
  voterId: string;
  targetId: string;
}

export interface GameResult {
  finalRoles: Record<string, RoleId>;
  originalRoles: Record<string, RoleId>;
  centerCards: RoleId[];
  originalCenterCards: RoleId[];
  votes: VoteRecord[];
  voteCounts: Record<string, number>;
  killedIds: string[];
  /** Kills caused by the Hunter's chain rule rather than by vote count. */
  hunterKills: { hunterId: string; targetId: string }[];
  werewolfKilled: boolean;
  /** False when both Werewolf cards ended up in the center. */
  anyWerewolfInPlay: boolean;
  tannerWin: boolean;
  tannerIds: string[];
  /** Which team met its condition ignoring the Tanner override. */
  baseWinningTeam: 'village' | 'werewolf';
  winningTeam: Team;
  winnerIds: string[];
  summary: string;
  nightLog: NightLogEntry[];
}

// ---------------------------------------------------------------------------
// Room state
// ---------------------------------------------------------------------------

export type Phase = 'lobby' | 'reveal' | 'night' | 'day' | 'voting' | 'results';

export interface RoomConfig {
  /** Explicit counts chosen by the host; Villagers fill the remainder. */
  roleCounts: Partial<Record<RoleId, number>>;
  discussionSeconds: number;
  nightActionSeconds: number;
  voteSeconds: number;
  revealSeconds: number;
  /**
   * When true the night banner names the acting role ("the Seer is awake").
   * When false everyone sees only "Night step 3 of 7". Who *holds* the role is
   * never revealed either way.
   */
  announceNightRoles: boolean;
}

export interface PublicPlayer {
  id: string;
  name: string;
  isBot: boolean;
  isHost: boolean;
  connected: boolean;
  /** Ready-up flag; meaning depends on phase (reveal seen / done discussing). */
  ready: boolean;
  seat: number;
}

export interface PublicNightState {
  stepIndex: number;
  totalSteps: number;
  /** `null` when `announceNightRoles` is off. */
  roleId: RoleId | null;
  endsAt: number;
}

export interface PublicRoomState {
  code: string;
  phase: Phase;
  players: PublicPlayer[];
  config: RoomConfig;
  hostId: string;
  /** The deck in play this round. Public — everyone may know the role list. */
  deck: RoleId[] | null;
  night: PublicNightState | null;
  day: { endsAt: number } | null;
  voting: { endsAt: number; votedIds: string[] } | null;
  results: GameResult | null;
  revealEndsAt: number | null;
  minPlayers: number;
  maxPlayers: number;
}

// ---------------------------------------------------------------------------
// Socket contract
// ---------------------------------------------------------------------------

export interface JoinedPayload {
  playerId: string;
  /** Secret used to reclaim this seat after a refresh or disconnect. */
  token: string;
  roomCode: string;
}

export interface ErrorPayload {
  code:
    | 'room_not_found'
    | 'room_full'
    | 'name_taken'
    | 'not_host'
    | 'bad_phase'
    | 'bad_config'
    | 'bad_action'
    | 'invalid_name'
    | 'rejoin_failed'
    | 'internal';
  message: string;
}

export interface ClientToServerEvents {
  'room:create': (
    payload: { name: string; config?: Partial<RoomConfig>; tutorial?: boolean },
    ack: (res: JoinedPayload | { error: ErrorPayload }) => void
  ) => void;
  'room:join': (
    payload: { code: string; name: string; tutorial?: boolean },
    ack: (res: JoinedPayload | { error: ErrorPayload }) => void
  ) => void;
  'room:rejoin': (
    payload: { code: string; playerId: string; token: string },
    ack: (res: JoinedPayload | { error: ErrorPayload }) => void
  ) => void;
  'room:leave': () => void;
  'room:addBot': () => void;
  'room:removeBot': (payload: { playerId: string }) => void;
  'room:kick': (payload: { playerId: string }) => void;
  'room:config': (payload: { config: Partial<RoomConfig> }) => void;
  'room:start': () => void;
  'player:ready': (payload: { ready: boolean }) => void;
  'night:action': (payload: { stepIndex: number; action: NightAction }) => void;
  'vote:cast': (payload: { targetId: string }) => void;
  'game:playAgain': () => void;
  'tutorial:set': (payload: { enabled: boolean }) => void;
}

export interface ServerToClientEvents {
  'room:state': (state: PublicRoomState) => void;
  'role:dealt': (payload: { role: RoleId; deck: RoleId[] }) => void;
  'night:turn': (turn: NightTurn) => void;
  'night:result': (result: NightActionResult) => void;
  'journal:set': (entries: JournalEntry[]) => void;
  'vote:ack': (payload: { targetId: string }) => void;
  'game:results': (result: GameResult) => void;
  // Deliberately not named `error` — Socket.IO treats that name specially on
  // the client and the payload would not arrive as a normal event.
  'game:error': (payload: ErrorPayload) => void;
}
