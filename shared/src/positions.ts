import type { CardMap, CardPosition, PositionKey, RoleId } from './types';
import { CENTER_COUNT } from './roles';

/** Position key for a player's seat. */
export function pKey(playerId: string): PositionKey {
  return `p:${playerId}`;
}

/** Position key for a center slot. */
export function cKey(index: number): PositionKey {
  return `c:${index}`;
}

export function keyOf(position: CardPosition): PositionKey {
  return position.kind === 'player' ? pKey(position.playerId) : cKey(position.index);
}

export function parseKey(key: PositionKey): CardPosition {
  if (key.startsWith('p:')) return { kind: 'player', playerId: key.slice(2) };
  if (key.startsWith('c:')) return { kind: 'center', index: Number(key.slice(2)) };
  throw new Error(`Malformed position key: ${key}`);
}

/** Read the card currently sitting at a position. */
export function cardAt(cards: CardMap, position: CardPosition): RoleId {
  const key = keyOf(position);
  const role = cards[key];
  if (!role) throw new Error(`No card at position ${key}`);
  return role;
}

/**
 * Exchange the cards at two positions. This is the *only* mutation the night
 * phase performs — every swap in the game (Robber, Troublemaker, Drunk) routes
 * through here, which keeps final-role tracking honest.
 */
export function swapCards(cards: CardMap, a: CardPosition, b: CardPosition): void {
  const ka = keyOf(a);
  const kb = keyOf(b);
  if (ka === kb) return;
  const ra = cards[ka];
  const rb = cards[kb];
  if (!ra || !rb) throw new Error(`Cannot swap: missing card at ${!ra ? ka : kb}`);
  cards[ka] = rb;
  cards[kb] = ra;
}

export function centerCards(cards: CardMap): RoleId[] {
  const out: RoleId[] = [];
  for (let i = 0; i < CENTER_COUNT; i++) out.push(cardAt(cards, { kind: 'center', index: i }));
  return out;
}

/**
 * The card each player holds right now. After the night sequence completes,
 * this is the final-role map that every win condition is evaluated against.
 */
export function playerCards(cards: CardMap, playerIds: string[]): Record<string, RoleId> {
  const out: Record<string, RoleId> = {};
  for (const id of playerIds) out[id] = cardAt(cards, { kind: 'player', playerId: id });
  return out;
}

export function isValidCenterIndex(index: unknown): index is number {
  return typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < CENTER_COUNT;
}
