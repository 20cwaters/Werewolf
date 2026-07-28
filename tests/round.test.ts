import { describe, expect, it } from 'vitest';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  applyNightAction,
  buildDeck,
  buildNightSequence,
  buildNightTurn,
  centerCards,
  dealCards,
  evaluateOutcome,
  playerCards,
  seededRng,
  suggestRoleCounts,
  teamOf,
  type GameResult,
  type RoleId,
  type VoteRecord,
} from '@onuw/shared';
import {
  decideBotNightAction,
  decideBotVote,
  newBotMemory,
  rememberResult,
  rememberTurn,
  type BotMemory,
} from '../server/src/bots';

interface Simulation {
  playerIds: string[];
  deck: RoleId[];
  dealtRoles: Record<string, RoleId>;
  finalRoles: Record<string, RoleId>;
  center: RoleId[];
  votes: VoteRecord[];
  result: GameResult;
}

/**
 * Play a whole round with every seat driven by the bot logic — the same code
 * path a solo game against bots takes on the server, minus the sockets.
 */
function simulateRound(playerCount: number, seed: number): Simulation {
  const rng = seededRng(seed);
  const playerIds = Array.from({ length: playerCount }, (_, i) => `p${i + 1}`);
  const players = playerIds.map((id) => ({ id, name: id.toUpperCase() }));

  const deck = buildDeck(suggestRoleCounts(playerCount));
  const deal = dealCards(deck, playerIds, rng);
  const ctx = { players, cards: deal.cards, originalRoles: deal.originalRoles };
  const steps = buildNightSequence(deck, deal.originalRoles, playerIds);

  const memories = new Map<string, BotMemory>(
    playerIds.map((id) => [id, newBotMemory(deal.originalRoles[id])])
  );

  for (const step of steps) {
    for (const actorId of step.actorIds) {
      const memory = memories.get(actorId) as BotMemory;
      // Bots receive exactly the payload a human client would get.
      const turn = buildNightTurn(ctx, step, actorId, steps.length, 0);
      rememberTurn(memory, turn);
      const action = decideBotNightAction(step, actorId, memory, playerIds, rng);
      const { result } = applyNightAction(ctx, step, actorId, action);
      rememberResult(memory, result);
    }
  }

  const finalRoles = playerCards(ctx.cards, playerIds);
  const votes: VoteRecord[] = playerIds.map((id) => ({
    voterId: id,
    targetId: decideBotVote(id, memories.get(id) as BotMemory, playerIds, rng),
  }));

  const result = evaluateOutcome({
    players,
    finalRoles,
    votes,
    originalRoles: deal.originalRoles,
    centerCards: centerCards(ctx.cards),
    originalCenterCards: deal.originalCenterCards,
  });

  return {
    playerIds,
    deck,
    dealtRoles: deal.originalRoles,
    finalRoles,
    center: centerCards(ctx.cards),
    votes,
    result,
  };
}

describe('full rounds against bots', () => {
  const sims: Simulation[] = [];
  for (let playerCount = MIN_PLAYERS; playerCount <= MAX_PLAYERS; playerCount++) {
    for (let seed = 1; seed <= 40; seed++) {
      sims.push(simulateRound(playerCount, seed * 1000 + playerCount));
    }
  }

  it('plays every table size to completion without an illegal action', () => {
    expect(sims).toHaveLength((MAX_PLAYERS - MIN_PLAYERS + 1) * 40);
  });

  it('never creates, destroys or duplicates a card', () => {
    for (const sim of sims) {
      const onBoard = [...Object.values(sim.finalRoles), ...sim.center].sort();
      expect(onBoard).toEqual(sim.deck.slice().sort());
    }
  });

  it('leaves exactly one card in every seat and three in the center', () => {
    for (const sim of sims) {
      expect(Object.keys(sim.finalRoles).sort()).toEqual(sim.playerIds.slice().sort());
      expect(sim.center).toHaveLength(3);
    }
  });

  it('casts one legal vote per player', () => {
    for (const sim of sims) {
      expect(sim.votes).toHaveLength(sim.playerIds.length);
      for (const vote of sim.votes) {
        expect(sim.playerIds).toContain(vote.targetId);
      }
      // Every player votes exactly once.
      expect(new Set(sim.votes.map((v) => v.voterId)).size).toBe(sim.playerIds.length);
    }
  });

  it('kills only real players and always kills someone when votes exist', () => {
    for (const sim of sims) {
      for (const id of sim.result.killedIds) expect(sim.playerIds).toContain(id);
      // With every seat voting there is always a leader, so somebody dies.
      expect(sim.result.killedIds.length).toBeGreaterThan(0);
    }
  });

  it('derives the winning team consistently from the final roles', () => {
    for (const sim of sims) {
      const { result } = sim;
      const expectedBase = result.werewolfKilled ? 'village' : 'werewolf';
      expect(result.baseWinningTeam).toBe(expectedBase);
      expect(result.winningTeam).toBe(result.tannerWin ? 'tanner' : expectedBase);

      // werewolfKilled must agree with the final-role map.
      const actualWolfKilled = result.killedIds.some((id) => sim.finalRoles[id] === 'werewolf');
      expect(result.werewolfKilled).toBe(actualWolfKilled);
    }
  });

  it('awards the win to exactly the players on the winning team', () => {
    for (const sim of sims) {
      const { result } = sim;
      for (const id of result.winnerIds) expect(sim.playerIds).toContain(id);

      if (result.winningTeam === 'tanner') {
        // A Tanner win is a solo win by the killed Tanner(s).
        expect(result.winnerIds).toEqual(result.tannerIds);
        for (const id of result.winnerIds) {
          expect(sim.finalRoles[id]).toBe('tanner');
          expect(result.killedIds).toContain(id);
        }
      } else {
        for (const id of result.winnerIds) {
          expect(teamOf(sim.finalRoles[id])).toBe(result.winningTeam);
        }
        // ...and nobody on that team is left out.
        const expected = sim.playerIds
          .filter((id) => teamOf(sim.finalRoles[id]) === result.winningTeam)
          .sort();
        expect(result.winnerIds.slice().sort()).toEqual(expected);
      }
    }
  });

  it('only reports Hunter kills for players who really are the Hunter', () => {
    for (const sim of sims) {
      for (const { hunterId, targetId } of sim.result.hunterKills) {
        expect(sim.finalRoles[hunterId]).toBe('hunter');
        expect(sim.result.killedIds).toContain(hunterId);
        expect(sim.result.killedIds).toContain(targetId);
        // The shot must match the Hunter's actual vote.
        expect(sim.votes.find((v) => v.voterId === hunterId)?.targetId).toBe(targetId);
      }
    }
  });

  it('produces rounds where roles actually moved between seats', () => {
    // Guards against a regression that quietly stops applying swaps.
    const changed = sims.filter((sim) =>
      sim.playerIds.some((id) => sim.finalRoles[id] !== sim.dealtRoles[id])
    );
    expect(changed.length).toBeGreaterThan(sims.length * 0.5);
  });

  it('produces both Village and Werewolf wins across many rounds', () => {
    const teams = new Set(sims.map((s) => s.result.winningTeam));
    expect(teams).toContain('village');
    expect(teams).toContain('werewolf');
  });

  it('is deterministic for a fixed seed', () => {
    const a = simulateRound(6, 777);
    const b = simulateRound(6, 777);
    expect(b.finalRoles).toEqual(a.finalRoles);
    expect(b.votes).toEqual(a.votes);
    expect(b.result.winningTeam).toBe(a.result.winningTeam);
  });
});

describe('bot voting heuristics', () => {
  it('keeps Werewolf-team bots from voting for a wolf they know about', () => {
    const playerIds = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const memory = newBotMemory('werewolf');
    memory.suspectedWolves.add('p2'); // fellow wolf seen at night

    for (let seed = 0; seed < 200; seed++) {
      const target = decideBotVote('p1', memory, playerIds, seededRng(seed));
      expect(target).not.toBe('p2');
      expect(target).not.toBe('p1');
    }
  });

  it('has the Minion protect the wolves it was shown', () => {
    const playerIds = ['p1', 'p2', 'p3', 'p4'];
    const memory = newBotMemory('minion');
    memory.suspectedWolves.add('p3');
    memory.suspectedWolves.add('p4');

    for (let seed = 0; seed < 200; seed++) {
      expect(decideBotVote('p1', memory, playerIds, seededRng(seed))).toBe('p2');
    }
  });

  it('has a village bot vote a Werewolf it saw', () => {
    const playerIds = ['p1', 'p2', 'p3', 'p4'];
    const memory = newBotMemory('seer');
    memory.suspectedWolves.add('p4');

    for (let seed = 0; seed < 200; seed++) {
      expect(decideBotVote('p1', memory, playerIds, seededRng(seed))).toBe('p4');
    }
  });

  it('keeps a Mason bot from voting for its confirmed partner', () => {
    const playerIds = ['p1', 'p2', 'p3'];
    const memory = newBotMemory('mason');
    memory.allies.add('p2');

    for (let seed = 0; seed < 200; seed++) {
      expect(decideBotVote('p1', memory, playerIds, seededRng(seed))).toBe('p3');
    }
  });

  it('switches sides when the Robber bot steals the Werewolf card', () => {
    const playerIds = ['p1', 'p2', 'p3', 'p4'];
    const memory = newBotMemory('robber');
    // The Robber's own action result tells it that it is now the Werewolf.
    rememberResult(memory, {
      stepIndex: 4,
      role: 'robber',
      revealed: [{ position: { kind: 'player', playerId: 'p1' }, label: 'You', role: 'werewolf' }],
      ownRole: 'werewolf',
      message: '',
    });
    expect(memory.believedRole).toBe('werewolf');

    // It now behaves as a wolf: it will not vote for a wolf it knows of.
    memory.suspectedWolves.add('p2');
    for (let seed = 0; seed < 100; seed++) {
      expect(decideBotVote('p1', memory, playerIds, seededRng(seed))).not.toBe('p2');
    }
  });

  it('leaves a Drunk bot genuinely unsure of its own team', () => {
    const memory = newBotMemory('drunk');
    rememberResult(memory, {
      stepIndex: 6,
      role: 'drunk',
      revealed: [],
      ownRole: null,
      message: '',
    });
    expect(memory.ownRoleUnknown).toBe(true);
  });

  it('never votes for a player who is not at the table', () => {
    const playerIds = ['p1', 'p2', 'p3'];
    for (const role of ['werewolf', 'minion', 'seer', 'tanner', 'villager'] as RoleId[]) {
      for (let seed = 0; seed < 60; seed++) {
        const target = decideBotVote('p1', newBotMemory(role), playerIds, seededRng(seed));
        expect(playerIds).toContain(target);
      }
    }
  });
});
