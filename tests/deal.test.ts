import { describe, expect, it } from 'vitest';
import { CENTER_COUNT, buildDeck, dealCards, seededRng, suggestRoleCounts } from '@onuw/shared';
import { centerOf } from './helpers';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

describe('dealing', () => {
  it('gives every player exactly one card and leaves three in the center', () => {
    const deck = buildDeck(suggestRoleCounts(6));
    const deal = dealCards(deck, ids(6), seededRng(1));

    expect(Object.keys(deal.originalRoles)).toHaveLength(6);
    expect(deal.originalCenterCards).toHaveLength(CENTER_COUNT);
    // 6 player positions + 3 center positions.
    expect(Object.keys(deal.cards)).toHaveLength(9);
  });

  it('preserves the exact multiset of cards from the deck', () => {
    const deck = buildDeck(suggestRoleCounts(8));
    const deal = dealCards(deck, ids(8), seededRng(42));
    expect(deal.shuffled.slice().sort()).toEqual(deck.slice().sort());
    expect(Object.values(deal.cards).sort()).toEqual(deck.slice().sort());
  });

  it('starts with dealt roles matching the board exactly', () => {
    const deck = buildDeck(suggestRoleCounts(5));
    const deal = dealCards(deck, ids(5), seededRng(7));
    const ctx = { players: [], cards: deal.cards, originalRoles: deal.originalRoles };
    for (const [id, role] of Object.entries(deal.originalRoles)) {
      expect(deal.cards[`p:${id}`]).toBe(role);
    }
    expect(centerOf(ctx as never)).toEqual(deal.originalCenterCards);
  });

  it('is deterministic for a given seed and varies across seeds', () => {
    const deck = buildDeck(suggestRoleCounts(5));
    const a = dealCards(deck, ids(5), seededRng(123));
    const b = dealCards(deck, ids(5), seededRng(123));
    expect(a.shuffled).toEqual(b.shuffled);

    const seeds = new Set(
      Array.from({ length: 20 }, (_, s) => dealCards(deck, ids(5), seededRng(s)).shuffled.join(','))
    );
    expect(seeds.size).toBeGreaterThan(1);
  });

  it('refuses a deck that does not match the table size', () => {
    const deck = buildDeck(suggestRoleCounts(5)); // 8 cards
    expect(() => dealCards(deck, ids(6), seededRng(1))).toThrow(/exactly 9/);
    expect(() => dealCards(deck, ids(4), seededRng(1))).toThrow(/exactly 7/);
  });
});
