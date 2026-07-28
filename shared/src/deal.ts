import type { CardMap, RoleId } from './types';
import { CENTER_COUNT } from './roles';
import { cKey, pKey } from './positions';
import { defaultRng, shuffle, type Rng } from './rng';
import { totalCardsFor } from './deck';

export interface Deal {
  /** Current card layout. Night actions mutate this in place. */
  cards: CardMap;
  /**
   * The card each player was dealt. This never changes and it is what decides
   * *which night action a player performs* — a robbed Seer still wakes as the
   * Seer, they simply may no longer be one by dawn.
   */
  originalRoles: Record<string, RoleId>;
  /** Center cards as first dealt, for the results screen. */
  originalCenterCards: RoleId[];
  /** The shuffled deck, in dealt order. */
  shuffled: RoleId[];
}

/**
 * Deal one card to each player in seat order and put the remaining three in the
 * center. Throws if the deck size does not match the table — callers should
 * validate first.
 */
export function dealCards(
  deck: readonly RoleId[],
  playerIds: readonly string[],
  rng: Rng = defaultRng
): Deal {
  const required = totalCardsFor(playerIds.length);
  if (deck.length !== required) {
    throw new Error(
      `Deck has ${deck.length} cards but ${playerIds.length} players need exactly ${required}.`
    );
  }

  const shuffled = shuffle(deck, rng);
  const cards: CardMap = {};
  const originalRoles: Record<string, RoleId> = {};

  playerIds.forEach((playerId, i) => {
    const role = shuffled[i];
    cards[pKey(playerId)] = role;
    originalRoles[playerId] = role;
  });

  const originalCenterCards: RoleId[] = [];
  for (let i = 0; i < CENTER_COUNT; i++) {
    const role = shuffled[playerIds.length + i];
    cards[cKey(i)] = role;
    originalCenterCards.push(role);
  }

  return { cards, originalRoles, originalCenterCards, shuffled };
}
