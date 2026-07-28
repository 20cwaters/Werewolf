import { describe, expect, it } from 'vitest';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROLES,
  ROLE_DISPLAY_ORDER,
  buildDeck,
  countTotal,
  deckToCounts,
  sanitizeRoleCounts,
  suggestRoleCounts,
  totalCardsFor,
  validateRoleCounts,
} from '@onuw/shared';

describe('deck math', () => {
  it('always needs player count plus three center cards', () => {
    expect(totalCardsFor(3)).toBe(6);
    expect(totalCardsFor(5)).toBe(8);
    expect(totalCardsFor(10)).toBe(13);
  });

  it('suggests a legal deck for every supported table size', () => {
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      const counts = suggestRoleCounts(n);
      const result = validateRoleCounts(counts, n);
      expect(result.errors, `player count ${n}`).toEqual([]);
      expect(result.ok).toBe(true);
      expect(countTotal(counts)).toBe(totalCardsFor(n));
    }
  });

  it('never suggests more copies of a role than exist in the box', () => {
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      const counts = suggestRoleCounts(n);
      for (const id of ROLE_DISPLAY_ORDER) {
        if (id === 'villager') continue;
        expect(counts[id] ?? 0).toBeLessThanOrEqual(ROLES[id].maxCount);
      }
    }
  });

  it('never suggests a single unpaired Mason', () => {
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      const masons = suggestRoleCounts(n).mason ?? 0;
      expect(masons === 0 || masons === 2).toBe(true);
    }
  });

  it('rejects a deck that does not match the table size', () => {
    const counts = { werewolf: 2, seer: 1, robber: 1 };
    const result = validateRoleCounts(counts, 5);
    expect(result.ok).toBe(false);
    expect(result.total).toBe(4);
    expect(result.required).toBe(8);
    expect(result.errors.join(' ')).toContain('Add 4 more cards');
  });

  it('reports when the deck is too large', () => {
    const counts = { werewolf: 2, seer: 1, robber: 1, villager: 5 };
    const result = validateRoleCounts(counts, 3);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('Remove 3 cards');
  });

  it('rejects more copies of a role than the box contains', () => {
    const result = validateRoleCounts({ werewolf: 3, seer: 1, robber: 1, villager: 1 }, 3);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('Only 2 Werewolf card(s) exist');
  });

  it('requires at least one Werewolf card', () => {
    const result = validateRoleCounts({ seer: 1, robber: 1, troublemaker: 1, villager: 3 }, 3);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('at least one Werewolf');
  });

  it('rejects tables below the minimum player count', () => {
    const result = validateRoleCounts(suggestRoleCounts(3), 2);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('at least 3 players');
  });

  it('round-trips counts through buildDeck and deckToCounts', () => {
    const counts = suggestRoleCounts(7);
    const deck = buildDeck(counts);
    expect(deck).toHaveLength(totalCardsFor(7));
    expect(deckToCounts(deck)).toEqual(counts);
  });

  it('sanitizes hostile count input', () => {
    const dirty = {
      werewolf: 99,
      seer: -4,
      robber: 1.7,
      villager: 2,
      notARole: 5,
      insomniac: Number.NaN,
    };
    expect(sanitizeRoleCounts(dirty)).toEqual({ werewolf: 2, robber: 1, villager: 2 });
    expect(sanitizeRoleCounts(null)).toEqual({});
    expect(sanitizeRoleCounts('nope')).toEqual({});
  });
});
