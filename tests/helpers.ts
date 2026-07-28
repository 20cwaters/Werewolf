import {
  cKey,
  pKey,
  type CardMap,
  type NightContext,
  type NightPlayer,
  type RoleId,
} from '@onuw/shared';

export function players(count: number): NightPlayer[] {
  return Array.from({ length: count }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` }));
}

/**
 * Build a night context with an exact, hand-placed card layout so tests can
 * pin down swap chains without fighting the shuffle.
 */
export function makeCtx(dealt: Record<string, RoleId>, center: RoleId[]): NightContext {
  const cards: CardMap = {};
  for (const [id, role] of Object.entries(dealt)) cards[pKey(id)] = role;
  center.forEach((role, i) => {
    cards[cKey(i)] = role;
  });
  return {
    players: Object.keys(dealt).map((id) => ({ id, name: id.toUpperCase() })),
    cards,
    originalRoles: { ...dealt },
  };
}

export function deckOf(dealt: Record<string, RoleId>, center: RoleId[]): RoleId[] {
  return [...Object.values(dealt), ...center];
}

/** Current card in each player's seat. */
export function seats(ctx: NightContext): Record<string, RoleId> {
  const out: Record<string, RoleId> = {};
  for (const p of ctx.players) out[p.id] = ctx.cards[pKey(p.id)];
  return out;
}

export function centerOf(ctx: NightContext, size = 3): RoleId[] {
  return Array.from({ length: size }, (_, i) => ctx.cards[cKey(i)]);
}
