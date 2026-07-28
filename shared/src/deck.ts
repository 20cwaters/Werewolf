import type { RoleId } from './types';
import { CENTER_COUNT, MAX_PLAYERS, MIN_PLAYERS, ROLES, ROLE_DISPLAY_ORDER } from './roles';

/** Roles in play always equal player count plus the three center cards. */
export function totalCardsFor(playerCount: number): number {
  return playerCount + CENTER_COUNT;
}

export type RoleCounts = Partial<Record<RoleId, number>>;

export function countTotal(counts: RoleCounts): number {
  return ROLE_DISPLAY_ORDER.reduce((sum, id) => sum + (counts[id] ?? 0), 0);
}

/**
 * Deck presets by player count, added in groups so paired roles stay paired —
 * a single Mason with no partner is legal but a poor default, and the two
 * Werewolf cards should always enter together.
 */
const PRESET_GROUPS: RoleId[][] = [
  ['werewolf', 'werewolf'],
  ['seer'],
  ['robber'],
  ['troublemaker'],
  ['villager'],
  ['minion'],
  ['insomniac'],
  ['mason', 'mason'],
  ['drunk'],
  ['tanner'],
  ['hunter'],
  ['villager'],
  ['villager'],
];

/**
 * A sensible starting deck for a given player count. The host can override any
 * of it in the lobby; this just guarantees the lobby opens on a legal deck.
 */
export function suggestRoleCounts(playerCount: number): RoleCounts {
  const target = totalCardsFor(playerCount);
  const counts: RoleCounts = {};
  let used = 0;

  for (const group of PRESET_GROUPS) {
    if (used + group.length > target) continue;
    for (const id of group) {
      if ((counts[id] ?? 0) >= ROLES[id].maxCount) continue;
      counts[id] = (counts[id] ?? 0) + 1;
      used += 1;
    }
  }

  // Any shortfall becomes Villagers, raising the Villager cap if we must.
  if (used < target) counts.villager = (counts.villager ?? 0) + (target - used);
  return counts;
}

export interface DeckValidation {
  ok: boolean;
  total: number;
  required: number;
  errors: string[];
}

/**
 * A deck is legal when it has exactly `playerCount + 3` cards, no role exceeds
 * its printed count, and at least one Werewolf card is present (otherwise the
 * Werewolf team can never be threatened and the round is meaningless).
 */
export function validateRoleCounts(counts: RoleCounts, playerCount: number): DeckValidation {
  const errors: string[] = [];
  const required = totalCardsFor(playerCount);
  const total = countTotal(counts);

  if (playerCount < MIN_PLAYERS) {
    errors.push(`Need at least ${MIN_PLAYERS} players (including bots).`);
  }
  if (playerCount > MAX_PLAYERS) {
    errors.push(`No more than ${MAX_PLAYERS} players.`);
  }

  for (const id of ROLE_DISPLAY_ORDER) {
    const n = counts[id] ?? 0;
    if (!Number.isInteger(n) || n < 0) {
      errors.push(`${ROLES[id].name} count must be a non-negative whole number.`);
      continue;
    }
    // Villagers are the filler role, so their count is unbounded.
    if (id !== 'villager' && n > ROLES[id].maxCount) {
      errors.push(`Only ${ROLES[id].maxCount} ${ROLES[id].name} card(s) exist.`);
    }
  }

  if (total !== required) {
    const delta = required - total;
    errors.push(
      delta > 0
        ? `Add ${delta} more card${delta === 1 ? '' : 's'} — need ${required} for ${playerCount} players.`
        : `Remove ${-delta} card${-delta === 1 ? '' : 's'} — need ${required} for ${playerCount} players.`
    );
  }

  if ((counts.werewolf ?? 0) < 1) {
    errors.push('Include at least one Werewolf card.');
  }

  return { ok: errors.length === 0, total, required, errors };
}

/** Expand counts into a flat, deterministic list of cards. */
export function buildDeck(counts: RoleCounts): RoleId[] {
  const deck: RoleId[] = [];
  for (const id of ROLE_DISPLAY_ORDER) {
    const n = counts[id] ?? 0;
    for (let i = 0; i < n; i++) deck.push(id);
  }
  return deck;
}

/** Collapse a flat deck back into counts (used for public deck summaries). */
export function deckToCounts(deck: readonly RoleId[]): RoleCounts {
  const counts: RoleCounts = {};
  for (const id of deck) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}

/**
 * Clamp an arbitrary count map to something storable: integers, within printed
 * limits, no unknown keys. Legality against player count is checked separately
 * so the lobby can hold a temporarily-invalid deck while the host edits it.
 */
export function sanitizeRoleCounts(input: unknown): RoleCounts {
  const out: RoleCounts = {};
  if (!input || typeof input !== 'object') return out;
  const record = input as Record<string, unknown>;
  for (const id of ROLE_DISPLAY_ORDER) {
    const raw = record[id];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    const cap = id === 'villager' ? MAX_PLAYERS + CENTER_COUNT : ROLES[id].maxCount;
    const n = Math.max(0, Math.min(cap, Math.floor(raw)));
    if (n > 0) out[id] = n;
  }
  return out;
}
