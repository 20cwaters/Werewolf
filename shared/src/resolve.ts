import type { GameResult, NightLogEntry, RoleId, Team, VoteRecord } from './types';
import { TEAM_LABEL, roleName, teamOf } from './roles';

export interface ResolvePlayer {
  id: string;
  name: string;
}

/** Count votes per target. Players with zero votes are omitted. */
export function tallyVotes(votes: readonly VoteRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const vote of votes) {
    counts[vote.targetId] = (counts[vote.targetId] ?? 0) + 1;
  }
  return counts;
}

/**
 * Everyone tied for the most votes dies. Ties kill *all* tied players, per the
 * configured house rule in the spec.
 */
export function highestVoted(counts: Record<string, number>): string[] {
  let max = 0;
  for (const n of Object.values(counts)) if (n > max) max = n;
  if (max === 0) return [];
  return Object.keys(counts)
    .filter((id) => counts[id] === max)
    .sort();
}

/**
 * Apply the Hunter's chain rule: a dying Hunter drags down whoever they voted
 * for, ignoring that player's vote count entirely.
 *
 * Resolved to a fixed point so a Hunter killed *by another Hunter's* shot also
 * fires. Hunter status is read from **final** roles, like every other
 * resolution-time ability.
 */
export function applyHunterRule(
  initialKilled: readonly string[],
  finalRoles: Record<string, RoleId>,
  votes: readonly VoteRecord[]
): { killedIds: string[]; hunterKills: { hunterId: string; targetId: string }[] } {
  const voteByVoter = new Map(votes.map((v) => [v.voterId, v.targetId]));
  const killed = new Set(initialKilled);
  const hunterKills: { hunterId: string; targetId: string }[] = [];
  const fired = new Set<string>();

  let changed = true;
  while (changed) {
    changed = false;
    for (const id of Array.from(killed)) {
      if (fired.has(id)) continue;
      if (finalRoles[id] !== 'hunter') continue;
      fired.add(id);
      const targetId = voteByVoter.get(id);
      // A Hunter who never voted (disconnected, no auto-vote) shoots nobody,
      // and a Hunter who voted for themselves adds no new casualty.
      if (!targetId || targetId === id || killed.has(targetId)) continue;
      killed.add(targetId);
      hunterKills.push({ hunterId: id, targetId });
      changed = true;
    }
  }

  return { killedIds: Array.from(killed).sort(), hunterKills };
}

/** Everyone whose final role belongs to `team`. */
export function playersOnTeam(finalRoles: Record<string, RoleId>, team: Team): string[] {
  return Object.keys(finalRoles)
    .filter((id) => teamOf(finalRoles[id]) === team)
    .sort();
}

export interface OutcomeInput {
  players: readonly ResolvePlayer[];
  /** Card each player holds after the whole night sequence resolved. */
  finalRoles: Record<string, RoleId>;
  votes: readonly VoteRecord[];
  originalRoles: Record<string, RoleId>;
  centerCards: readonly RoleId[];
  originalCenterCards: readonly RoleId[];
  nightLog?: readonly NightLogEntry[];
}

/**
 * The full end-of-game evaluation.
 *
 * Win conditions are judged on **final** roles, never dealt roles:
 *  - Any player who is currently a Werewolf gets killed  -> Village wins.
 *  - No such player is killed (including when no player is a Werewolf at all,
 *    e.g. both Werewolf cards sat in the center)          -> Werewolf team wins.
 *  - A killed Tanner wins alone, overriding both of the above. The team that
 *    would otherwise have won is still reported as `baseWinningTeam` so the
 *    results screen can call out the override.
 */
export function evaluateOutcome(input: OutcomeInput): GameResult {
  const { players, finalRoles, votes, originalRoles, centerCards, originalCenterCards } = input;

  const voteCounts = tallyVotes(votes);
  const voted = highestVoted(voteCounts);
  const { killedIds, hunterKills } = applyHunterRule(voted, finalRoles, votes);

  const werewolfKilled = killedIds.some((id) => finalRoles[id] === 'werewolf');
  const anyWerewolfInPlay = Object.values(finalRoles).includes('werewolf');
  const baseWinningTeam: 'village' | 'werewolf' = werewolfKilled ? 'village' : 'werewolf';

  const tannerIds = killedIds.filter((id) => finalRoles[id] === 'tanner');
  const tannerWin = tannerIds.length > 0;

  const winningTeam: Team = tannerWin ? 'tanner' : baseWinningTeam;
  const winnerIds = tannerWin ? tannerIds.slice().sort() : playersOnTeam(finalRoles, baseWinningTeam);

  return {
    finalRoles: { ...finalRoles },
    originalRoles: { ...originalRoles },
    centerCards: centerCards.slice(),
    originalCenterCards: originalCenterCards.slice(),
    votes: votes.slice(),
    voteCounts,
    killedIds,
    hunterKills,
    werewolfKilled,
    anyWerewolfInPlay,
    tannerWin,
    tannerIds: tannerIds.slice().sort(),
    baseWinningTeam,
    winningTeam,
    winnerIds,
    summary: buildSummary({
      players,
      finalRoles,
      killedIds,
      hunterKills,
      werewolfKilled,
      anyWerewolfInPlay,
      tannerWin,
      tannerIds,
      baseWinningTeam,
      winningTeam,
    }),
    nightLog: (input.nightLog ?? []).slice(),
  };
}

function buildSummary(args: {
  players: readonly ResolvePlayer[];
  finalRoles: Record<string, RoleId>;
  killedIds: readonly string[];
  hunterKills: readonly { hunterId: string; targetId: string }[];
  werewolfKilled: boolean;
  anyWerewolfInPlay: boolean;
  tannerWin: boolean;
  tannerIds: readonly string[];
  baseWinningTeam: 'village' | 'werewolf';
  winningTeam: Team;
}): string {
  const name = (id: string) => args.players.find((p) => p.id === id)?.name ?? 'Someone';
  const parts: string[] = [];

  if (args.killedIds.length === 0) {
    parts.push('Nobody was killed.');
  } else {
    const dead = args.killedIds
      .map((id) => `${name(id)} (${roleName(args.finalRoles[id])})`)
      .join(', ');
    parts.push(`${args.killedIds.length === 1 ? 'Killed' : 'Killed'}: ${dead}.`);
  }

  for (const { hunterId, targetId } of args.hunterKills) {
    parts.push(
      `${name(hunterId)} was the Hunter — their shot took ${name(targetId)} down with them.`
    );
  }

  if (args.werewolfKilled) {
    parts.push('A Werewolf was killed, so the Village team wins.');
  } else if (!args.anyWerewolfInPlay) {
    parts.push(
      'No player was a Werewolf — both Werewolf cards were in the center — so the Werewolf team wins by default.'
    );
  } else {
    parts.push('No Werewolf was killed, so the Werewolf team wins.');
  }

  if (args.tannerWin) {
    const tanners = args.tannerIds.map(name).join(' and ');
    parts.push(
      `But ${tanners} was the Tanner and got killed — the Tanner wins alone, overriding the ${
        TEAM_LABEL[args.baseWinningTeam]
      } team's result.`
    );
  }

  return parts.join(' ');
}

/** Human-readable team roster for the results screen. */
export function teamRoster(finalRoles: Record<string, RoleId>): Record<Team, string[]> {
  return {
    village: playersOnTeam(finalRoles, 'village'),
    werewolf: playersOnTeam(finalRoles, 'werewolf'),
    tanner: playersOnTeam(finalRoles, 'tanner'),
  };
}

export function didPlayerWin(result: GameResult, playerId: string): boolean {
  return result.winnerIds.includes(playerId);
}
