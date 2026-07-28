import { describe, expect, it } from 'vitest';
import {
  applyHunterRule,
  evaluateOutcome,
  highestVoted,
  playersOnTeam,
  tallyVotes,
  type RoleId,
  type VoteRecord,
} from '@onuw/shared';

const v = (voterId: string, targetId: string): VoteRecord => ({ voterId, targetId });

function outcome(
  finalRoles: Record<string, RoleId>,
  votes: VoteRecord[],
  originalRoles: Record<string, RoleId> = finalRoles
) {
  return evaluateOutcome({
    players: Object.keys(finalRoles).map((id) => ({ id, name: id.toUpperCase() })),
    finalRoles,
    votes,
    originalRoles,
    centerCards: ['villager', 'villager', 'villager'],
    originalCenterCards: ['villager', 'villager', 'villager'],
  });
}

describe('vote tallying', () => {
  it('counts votes per target', () => {
    expect(tallyVotes([v('p1', 'p3'), v('p2', 'p3'), v('p3', 'p1')])).toEqual({ p3: 2, p1: 1 });
  });

  it('kills only the top vote-getter', () => {
    expect(highestVoted({ p1: 1, p2: 3, p3: 2 })).toEqual(['p2']);
  });

  it('kills everyone tied for the most votes', () => {
    expect(highestVoted({ p1: 2, p2: 2, p3: 1 })).toEqual(['p1', 'p2']);
    // Everyone on one vote is still a tie for the lead, so everyone dies.
    expect(highestVoted({ p1: 1, p2: 1, p3: 1 })).toEqual(['p1', 'p2', 'p3']);
  });

  it('kills nobody when there are no votes at all', () => {
    expect(highestVoted({})).toEqual([]);
  });

  it('allows a player to vote for themselves', () => {
    const result = outcome({ p1: 'werewolf', p2: 'villager', p3: 'seer' }, [
      v('p1', 'p1'),
      v('p2', 'p1'),
      v('p3', 'p2'),
    ]);
    expect(result.voteCounts).toEqual({ p1: 2, p2: 1 });
    expect(result.killedIds).toEqual(['p1']);
    expect(result.winningTeam).toBe('village');
  });
});

describe("the Hunter's chain kill", () => {
  it('drags down whoever the Hunter voted for, ignoring vote counts', () => {
    const finalRoles: Record<string, RoleId> = { p1: 'hunter', p2: 'werewolf', p3: 'villager' };
    const votes = [v('p1', 'p3'), v('p2', 'p1'), v('p3', 'p1')];
    const { killedIds, hunterKills } = applyHunterRule(['p1'], finalRoles, votes);

    // p3 received a single vote yet still dies.
    expect(killedIds).toEqual(['p1', 'p3']);
    expect(hunterKills).toEqual([{ hunterId: 'p1', targetId: 'p3' }]);
  });

  it('does nothing when the Hunter survives', () => {
    const finalRoles: Record<string, RoleId> = { p1: 'hunter', p2: 'werewolf', p3: 'villager' };
    const votes = [v('p1', 'p3'), v('p2', 'p2'), v('p3', 'p2')];
    const { killedIds, hunterKills } = applyHunterRule(['p2'], finalRoles, votes);
    expect(killedIds).toEqual(['p2']);
    expect(hunterKills).toEqual([]);
  });

  it('adds no casualty when the Hunter voted for themselves', () => {
    const finalRoles: Record<string, RoleId> = { p1: 'hunter', p2: 'werewolf', p3: 'villager' };
    const { killedIds, hunterKills } = applyHunterRule(['p1'], finalRoles, [v('p1', 'p1')]);
    expect(killedIds).toEqual(['p1']);
    expect(hunterKills).toEqual([]);
  });

  it('adds no casualty when the target was already dying', () => {
    const finalRoles: Record<string, RoleId> = { p1: 'hunter', p2: 'werewolf', p3: 'villager' };
    const { killedIds, hunterKills } = applyHunterRule(['p1', 'p2'], finalRoles, [v('p1', 'p2')]);
    expect(killedIds).toEqual(['p1', 'p2']);
    expect(hunterKills).toEqual([]);
  });

  it('chains when a Hunter shoots another Hunter', () => {
    const finalRoles: Record<string, RoleId> = {
      p1: 'hunter',
      p2: 'hunter',
      p3: 'werewolf',
      p4: 'villager',
    };
    const votes = [v('p1', 'p2'), v('p2', 'p3'), v('p3', 'p1'), v('p4', 'p1')];
    const { killedIds, hunterKills } = applyHunterRule(['p1'], finalRoles, votes);

    // p1 dies -> shoots p2 -> p2 is also a Hunter -> shoots p3.
    expect(killedIds).toEqual(['p1', 'p2', 'p3']);
    expect(hunterKills).toEqual([
      { hunterId: 'p1', targetId: 'p2' },
      { hunterId: 'p2', targetId: 'p3' },
    ]);
  });

  it('uses the final role, so a player who became the Hunter mid-night fires', () => {
    // p2 was dealt the Robber but ends the night holding the Hunter card.
    const finalRoles: Record<string, RoleId> = { p1: 'robber', p2: 'hunter', p3: 'werewolf' };
    const originalRoles: Record<string, RoleId> = { p1: 'hunter', p2: 'robber', p3: 'werewolf' };
    const result = outcome(finalRoles, [v('p1', 'p2'), v('p2', 'p3'), v('p3', 'p2')], originalRoles);

    expect(result.killedIds).toEqual(['p2', 'p3']);
    expect(result.hunterKills).toEqual([{ hunterId: 'p2', targetId: 'p3' }]);
    // ...and the dealt Hunter (p1) does not fire.
    expect(result.hunterKills.some((k) => k.hunterId === 'p1')).toBe(false);
  });

  it('shoots nobody when the Hunter never cast a vote', () => {
    const finalRoles: Record<string, RoleId> = { p1: 'hunter', p2: 'werewolf', p3: 'villager' };
    const { killedIds, hunterKills } = applyHunterRule(['p1'], finalRoles, [
      v('p2', 'p1'),
      v('p3', 'p1'),
    ]);
    expect(killedIds).toEqual(['p1']);
    expect(hunterKills).toEqual([]);
  });
});

describe('win conditions on final roles', () => {
  it('gives the Village the win when a current Werewolf is killed', () => {
    const result = outcome({ p1: 'werewolf', p2: 'seer', p3: 'villager' }, [
      v('p2', 'p1'),
      v('p3', 'p1'),
      v('p1', 'p2'),
    ]);
    expect(result.werewolfKilled).toBe(true);
    expect(result.winningTeam).toBe('village');
    expect(result.winnerIds).toEqual(['p2', 'p3']);
  });

  it('gives the Werewolves the win when no current Werewolf is killed', () => {
    const result = outcome({ p1: 'werewolf', p2: 'seer', p3: 'villager' }, [
      v('p1', 'p2'),
      v('p3', 'p2'),
      v('p2', 'p1'),
    ]);
    expect(result.werewolfKilled).toBe(false);
    expect(result.winningTeam).toBe('werewolf');
    expect(result.winnerIds).toEqual(['p1']);
  });

  it('counts the Minion as a Werewolf-team winner but not as a Werewolf kill', () => {
    // The Minion is voted out; no actual Werewolf dies, so the wolves still win.
    const result = outcome({ p1: 'werewolf', p2: 'minion', p3: 'villager', p4: 'seer' }, [
      v('p1', 'p2'),
      v('p3', 'p2'),
      v('p4', 'p2'),
      v('p2', 'p1'),
    ]);
    expect(result.killedIds).toEqual(['p2']);
    expect(result.werewolfKilled).toBe(false);
    expect(result.winningTeam).toBe('werewolf');
    expect(result.winnerIds).toEqual(['p1', 'p2']);
  });

  it('judges on final roles, not dealt roles', () => {
    // p1 was dealt the Robber and stole the Werewolf card; p2 is now the Robber.
    const finalRoles: Record<string, RoleId> = { p1: 'werewolf', p2: 'robber', p3: 'villager' };
    const originalRoles: Record<string, RoleId> = { p1: 'robber', p2: 'werewolf', p3: 'villager' };

    const killedTheDealtWolf = outcome(
      finalRoles,
      [v('p1', 'p2'), v('p3', 'p2'), v('p2', 'p1')],
      originalRoles
    );
    // p2 held the Werewolf card at deal time but is a Robber now, so the
    // Village does *not* win by killing them.
    expect(killedTheDealtWolf.werewolfKilled).toBe(false);
    expect(killedTheDealtWolf.winningTeam).toBe('werewolf');
    expect(killedTheDealtWolf.winnerIds).toEqual(['p1']);

    const killedTheRealWolf = outcome(
      finalRoles,
      [v('p2', 'p1'), v('p3', 'p1'), v('p1', 'p3')],
      originalRoles
    );
    expect(killedTheRealWolf.werewolfKilled).toBe(true);
    expect(killedTheRealWolf.winningTeam).toBe('village');
  });

  it('gives the Werewolf team the win when both Werewolf cards are in the center', () => {
    const result = evaluateOutcome({
      players: ['p1', 'p2', 'p3'].map((id) => ({ id, name: id })),
      finalRoles: { p1: 'seer', p2: 'villager', p3: 'robber' },
      votes: [v('p1', 'p2'), v('p2', 'p3'), v('p3', 'p2')],
      originalRoles: { p1: 'seer', p2: 'villager', p3: 'robber' },
      centerCards: ['werewolf', 'werewolf', 'minion'],
      originalCenterCards: ['werewolf', 'werewolf', 'minion'],
    });

    expect(result.anyWerewolfInPlay).toBe(false);
    expect(result.werewolfKilled).toBe(false);
    expect(result.winningTeam).toBe('werewolf');
    // Nobody is on the Werewolf team, so the village simply loses.
    expect(result.winnerIds).toEqual([]);
    expect(result.summary).toContain('both Werewolf cards were in the center');
  });

  it('kills nobody and hands the Werewolves the win when no votes are cast', () => {
    const result = outcome({ p1: 'werewolf', p2: 'seer', p3: 'villager' }, []);
    expect(result.killedIds).toEqual([]);
    expect(result.winningTeam).toBe('werewolf');
    expect(result.summary).toContain('Nobody was killed');
  });

  it('puts every non-Werewolf, non-Minion, non-Tanner role on the Village team', () => {
    const finalRoles: Record<string, RoleId> = {
      p1: 'werewolf',
      p2: 'minion',
      p3: 'tanner',
      p4: 'seer',
      p5: 'mason',
      p6: 'drunk',
      p7: 'hunter',
      p8: 'villager',
    };
    expect(playersOnTeam(finalRoles, 'village')).toEqual(['p4', 'p5', 'p6', 'p7', 'p8']);
    expect(playersOnTeam(finalRoles, 'werewolf')).toEqual(['p1', 'p2']);
    expect(playersOnTeam(finalRoles, 'tanner')).toEqual(['p3']);
  });
});

describe('the Tanner override', () => {
  it('wins alone when killed, overriding a Village win', () => {
    // Both a Werewolf and the Tanner are voted out in a tie.
    const result = outcome({ p1: 'werewolf', p2: 'tanner', p3: 'seer', p4: 'villager' }, [
      v('p3', 'p1'),
      v('p4', 'p2'),
      v('p1', 'p2'),
      v('p2', 'p1'),
    ]);

    expect(result.killedIds).toEqual(['p1', 'p2']);
    expect(result.werewolfKilled).toBe(true);
    expect(result.baseWinningTeam).toBe('village');
    expect(result.tannerWin).toBe(true);
    expect(result.winningTeam).toBe('tanner');
    expect(result.winnerIds).toEqual(['p2']);
    expect(result.summary).toContain('Tanner wins alone');
  });

  it('wins alone when killed, overriding a Werewolf win', () => {
    const result = outcome({ p1: 'werewolf', p2: 'tanner', p3: 'seer' }, [
      v('p1', 'p2'),
      v('p3', 'p2'),
      v('p2', 'p2'),
    ]);
    expect(result.killedIds).toEqual(['p2']);
    expect(result.werewolfKilled).toBe(false);
    expect(result.baseWinningTeam).toBe('werewolf');
    expect(result.winningTeam).toBe('tanner');
    expect(result.winnerIds).toEqual(['p2']);
  });

  it('does not win when it survives', () => {
    const result = outcome({ p1: 'werewolf', p2: 'tanner', p3: 'seer' }, [
      v('p2', 'p1'),
      v('p3', 'p1'),
      v('p1', 'p3'),
    ]);
    expect(result.tannerWin).toBe(false);
    expect(result.winningTeam).toBe('village');
    // A surviving Tanner is on nobody's team, so it is not a Village winner.
    expect(result.winnerIds).toEqual(['p3']);
  });

  it('wins when it is dragged down by the Hunter rather than by votes', () => {
    const finalRoles: Record<string, RoleId> = {
      p1: 'hunter',
      p2: 'tanner',
      p3: 'werewolf',
      p4: 'villager',
    };
    const result = outcome(finalRoles, [
      v('p1', 'p2'),
      v('p2', 'p1'),
      v('p3', 'p1'),
      v('p4', 'p3'),
    ]);
    expect(result.killedIds).toEqual(['p1', 'p2']);
    expect(result.hunterKills).toEqual([{ hunterId: 'p1', targetId: 'p2' }]);
    expect(result.winningTeam).toBe('tanner');
    expect(result.winnerIds).toEqual(['p2']);
  });

  it('is judged on the final role, so a player who became the Tanner can win', () => {
    const finalRoles: Record<string, RoleId> = { p1: 'tanner', p2: 'robber', p3: 'werewolf' };
    const originalRoles: Record<string, RoleId> = { p1: 'robber', p2: 'tanner', p3: 'werewolf' };
    const result = outcome(finalRoles, [v('p2', 'p1'), v('p3', 'p1'), v('p1', 'p3')], originalRoles);

    expect(result.winningTeam).toBe('tanner');
    expect(result.winnerIds).toEqual(['p1']);
    // The dealt Tanner survived as the Robber and wins nothing.
    expect(result.tannerIds).toEqual(['p1']);
  });
});
