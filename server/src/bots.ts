import {
  type NightAction,
  type NightActionResult,
  type NightStep,
  type NightTurn,
  type RoleId,
  chance,
  defaultRng,
  pick,
  pickMany,
  teamOf,
  type Rng,
} from '@onuw/shared';

/**
 * Everything a bot has legitimately learned this round.
 *
 * Bots run inside the server process, so it would be trivial (and cheating) to
 * read the card layout directly. Instead a bot is fed exactly the same payloads
 * a human client receives — its night turn and its action result — and decides
 * from this memory alone.
 */
export interface BotMemory {
  /** Best guess at own card. Starts as the dealt role. */
  believedRole: RoleId;
  /** True once the Drunk swaps blind and the bot genuinely cannot know. */
  ownRoleUnknown: boolean;
  /** Players the bot has reason to believe hold a Werewolf card. */
  suspectedWolves: Set<string>;
  /** Players whose card the bot saw and it was not a Werewolf. */
  clearedPlayers: Set<string>;
  /** Confirmed allies (fellow Masons) it should not vote for. */
  allies: Set<string>;
}

export function newBotMemory(dealtRole: RoleId): BotMemory {
  return {
    believedRole: dealtRole,
    ownRoleUnknown: false,
    suspectedWolves: new Set(),
    clearedPlayers: new Set(),
    allies: new Set(),
  };
}

/** Fold a night turn's up-front information (peers) into memory. */
export function rememberTurn(memory: BotMemory, turn: NightTurn): void {
  if (turn.role === 'werewolf' || turn.role === 'minion') {
    // Werewolves see each other; the Minion is shown the Werewolves.
    for (const peer of turn.peers) memory.suspectedWolves.add(peer.id);
  }
  if (turn.role === 'mason') {
    for (const peer of turn.peers) memory.allies.add(peer.id);
  }
}

/** Fold an action result (revealed cards, new own-role) into memory. */
export function rememberResult(memory: BotMemory, result: NightActionResult): void {
  for (const card of result.revealed) {
    if (card.position.kind !== 'player') continue;
    const playerId = card.position.playerId;
    if (card.role === 'werewolf') memory.suspectedWolves.add(playerId);
    else memory.clearedPlayers.add(playerId);
  }

  if (result.ownRole) {
    memory.believedRole = result.ownRole;
    memory.ownRoleUnknown = false;
  } else if (result.role === 'drunk') {
    // The Drunk traded blind: it has no idea what it is now.
    memory.ownRoleUnknown = true;
  }
}

// ---------------------------------------------------------------------------
// Night decisions
// ---------------------------------------------------------------------------

/**
 * A legal, plausible night action. One Night has so much built-in uncertainty
 * that deep reasoning buys little — the goal is behaviour a human wouldn't
 * immediately read as robotic.
 */
export function decideBotNightAction(
  step: NightStep,
  actorId: string,
  memory: BotMemory,
  allPlayerIds: readonly string[],
  rng: Rng = defaultRng
): NightAction {
  const others = allPlayerIds.filter((id) => id !== actorId);

  switch (step.choiceKind) {
    case 'werewolf_lone_center':
      return { type: 'werewolf_center', center: pick([0, 1, 2], rng) };

    case 'seer': {
      // Prefer inspecting a player nobody has cleared yet; fall back to the
      // center pair, which is the safer "learn the deck" play.
      const unknown = others.filter(
        (id) => !memory.clearedPlayers.has(id) && !memory.suspectedWolves.has(id)
      );
      if (unknown.length > 0 && chance(0.6, rng)) {
        return { type: 'seer_player', targetId: pick(unknown, rng) };
      }
      if (others.length > 0 && chance(0.25, rng)) {
        return { type: 'seer_player', targetId: pick(others, rng) };
      }
      return { type: 'seer_center', centers: pickMany([0, 1, 2], 2, rng) };
    }

    case 'robber': {
      if (others.length === 0 || !chance(0.75, rng)) return { type: 'skip' };
      // Avoid robbing a player it already believes is a Werewolf — becoming the
      // Werewolf is a real risk of switching teams.
      const safe = others.filter((id) => !memory.suspectedWolves.has(id));
      const pool = safe.length > 0 ? safe : others;
      return { type: 'robber_rob', targetId: pick(pool, rng) };
    }

    case 'troublemaker': {
      if (others.length < 2 || !chance(0.75, rng)) return { type: 'skip' };
      // A Werewolf-team Troublemaker prefers to churn players it knows are not
      // wolves, muddying the village's reads without endangering the pack.
      const wolfSide = teamOf(memory.believedRole) === 'werewolf';
      const preferred = wolfSide
        ? others.filter((id) => !memory.suspectedWolves.has(id))
        : others;
      const pool = preferred.length >= 2 ? preferred : others;
      return { type: 'troublemaker_swap', targetIds: pickMany(pool, 2, rng) };
    }

    case 'drunk':
      return { type: 'drunk_swap', center: pick([0, 1, 2], rng) };

    default:
      return { type: 'acknowledge' };
  }
}

// ---------------------------------------------------------------------------
// Voting
// ---------------------------------------------------------------------------

/**
 * Simple, legal voting heuristics.
 *
 * Village-side bots vote their information when they have any and otherwise
 * spread out fairly randomly — which is genuinely how a single night round
 * plays for an uninformed villager. Werewolf-side bots protect known wolves and
 * push suspicion elsewhere.
 */
export function decideBotVote(
  voterId: string,
  memory: BotMemory,
  allPlayerIds: readonly string[],
  rng: Rng = defaultRng
): string {
  const others = allPlayerIds.filter((id) => id !== voterId);
  if (others.length === 0) return voterId;

  const role = memory.believedRole;

  // The Tanner needs to be killed, so voting for itself is a real (if partial)
  // play toward its own win condition.
  if (role === 'tanner' && !memory.ownRoleUnknown) {
    return chance(0.5, rng) ? voterId : pick(others, rng);
  }

  const onWolfTeam = teamOf(role) === 'werewolf' && !memory.ownRoleUnknown;

  if (onWolfTeam) {
    // Never sell out the pack. Frame someone the bot knows is not a wolf when
    // it can, since that vote is guaranteed not to cost the team the game.
    const framable = others.filter(
      (id) => !memory.suspectedWolves.has(id) && memory.clearedPlayers.has(id)
    );
    if (framable.length > 0) return pick(framable, rng);

    const safe = others.filter((id) => !memory.suspectedWolves.has(id));
    if (safe.length > 0) return pick(safe, rng);

    // Every other player is a known wolf (tiny tables only) — vote self rather
    // than hand the village a Werewolf kill.
    return voterId;
  }

  // Village side: act on hard information first.
  const knownWolves = others.filter((id) => memory.suspectedWolves.has(id));
  if (knownWolves.length > 0) return pick(knownWolves, rng);

  let pool = others.filter((id) => !memory.allies.has(id) && !memory.clearedPlayers.has(id));
  if (pool.length === 0) pool = others.filter((id) => !memory.allies.has(id));
  if (pool.length === 0) pool = others;
  return pick(pool, rng);
}

// ---------------------------------------------------------------------------
// Pacing
// ---------------------------------------------------------------------------

/** Watchable but not sluggish delay before a bot acts, in milliseconds. */
export function botThinkDelay(rng: Rng = defaultRng, min = 1200, max = 2800): number {
  return Math.round(min + rng() * (max - min));
}
