import { describe, expect, it } from 'vitest';
import {
  NightActionError,
  applyNightAction,
  autoNightAction,
  buildNightSequence,
  buildNightTurn,
  type NightStep,
  type RoleId,
} from '@onuw/shared';
import { centerOf, deckOf, makeCtx, seats } from './helpers';

function stepFor(steps: NightStep[], role: RoleId): NightStep {
  const step = steps.find((s) => s.role === role);
  if (!step) throw new Error(`No ${role} step in sequence`);
  return step;
}

describe('night sequencing', () => {
  it('orders steps by the fixed wake order', () => {
    const dealt: Record<string, RoleId> = {
      p1: 'insomniac',
      p2: 'drunk',
      p3: 'seer',
      p4: 'werewolf',
      p5: 'troublemaker',
    };
    const center: RoleId[] = ['robber', 'minion', 'mason'];
    const steps = buildNightSequence(deckOf(dealt, center), dealt, Object.keys(dealt));

    expect(steps.map((s) => s.role)).toEqual([
      'werewolf',
      'minion',
      'mason',
      'seer',
      'robber',
      'troublemaker',
      'drunk',
      'insomniac',
    ]);
    expect(steps.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('omits steps for roles that are not in the deck at all', () => {
    const dealt: Record<string, RoleId> = { p1: 'werewolf', p2: 'seer', p3: 'villager' };
    const center: RoleId[] = ['villager', 'hunter', 'tanner'];
    const steps = buildNightSequence(deckOf(dealt, center), dealt, Object.keys(dealt));

    // Hunter and Tanner never wake; Robber/Drunk/etc. are not in the deck.
    expect(steps.map((s) => s.role)).toEqual(['werewolf', 'seer']);
  });

  it('keeps a decoy step for a waking role whose every copy is in the center', () => {
    const dealt: Record<string, RoleId> = { p1: 'werewolf', p2: 'villager', p3: 'villager' };
    const center: RoleId[] = ['seer', 'robber', 'insomniac'];
    const steps = buildNightSequence(deckOf(dealt, center), dealt, Object.keys(dealt));

    // The Seer/Robber/Insomniac steps must still exist and run with no actors,
    // otherwise their absence would leak that those cards are in the center.
    expect(steps.map((s) => s.role)).toEqual(['werewolf', 'seer', 'robber', 'insomniac']);
    expect(stepFor(steps, 'seer').actorIds).toEqual([]);
    expect(stepFor(steps, 'robber').actorIds).toEqual([]);
    expect(stepFor(steps, 'werewolf').actorIds).toEqual(['p1']);
  });

  it('gives a lone Werewolf a center peek but a pair only a mutual look', () => {
    const solo: Record<string, RoleId> = { p1: 'werewolf', p2: 'seer', p3: 'villager' };
    const soloSteps = buildNightSequence(
      deckOf(solo, ['werewolf', 'robber', 'villager']),
      solo,
      Object.keys(solo)
    );
    expect(stepFor(soloSteps, 'werewolf').choiceKind).toBe('werewolf_lone_center');

    const pair: Record<string, RoleId> = { p1: 'werewolf', p2: 'werewolf', p3: 'villager' };
    const pairSteps = buildNightSequence(
      deckOf(pair, ['seer', 'robber', 'villager']),
      pair,
      Object.keys(pair)
    );
    const step = stepFor(pairSteps, 'werewolf');
    expect(step.choiceKind).toBe('none');
    expect(step.actorIds).toEqual(['p1', 'p2']);
  });

  it('marks only the Drunk as mandatory', () => {
    const dealt: Record<string, RoleId> = { p1: 'drunk', p2: 'werewolf', p3: 'seer' };
    const steps = buildNightSequence(
      deckOf(dealt, ['robber', 'troublemaker', 'villager']),
      dealt,
      Object.keys(dealt)
    );
    for (const step of steps) {
      expect(step.mandatory).toBe(step.role === 'drunk');
    }
  });
});

describe('information boundaries', () => {
  it('shows Werewolves each other but never shows them the Minion', () => {
    const dealt: Record<string, RoleId> = {
      p1: 'werewolf',
      p2: 'werewolf',
      p3: 'minion',
      p4: 'villager',
    };
    const ctx = makeCtx(dealt, ['seer', 'robber', 'villager']);
    const steps = buildNightSequence(deckOf(dealt, ['seer', 'robber', 'villager']), dealt, [
      'p1',
      'p2',
      'p3',
      'p4',
    ]);

    const wolfTurn = buildNightTurn(ctx, stepFor(steps, 'werewolf'), 'p1', steps.length, 0);
    expect(wolfTurn.peers.map((p) => p.id)).toEqual(['p2']);
    expect(wolfTurn.peers.map((p) => p.id)).not.toContain('p3');

    const minionTurn = buildNightTurn(ctx, stepFor(steps, 'minion'), 'p3', steps.length, 0);
    expect(minionTurn.peers.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('tells a lone Mason that no other Mason is in play', () => {
    const dealt: Record<string, RoleId> = { p1: 'mason', p2: 'werewolf', p3: 'villager' };
    const center: RoleId[] = ['mason', 'seer', 'villager'];
    const ctx = makeCtx(dealt, center);
    const steps = buildNightSequence(deckOf(dealt, center), dealt, ['p1', 'p2', 'p3']);
    const step = stepFor(steps, 'mason');

    const turn = buildNightTurn(ctx, step, 'p1', steps.length, 0);
    expect(turn.peers).toEqual([]);
    expect(turn.peersLabel).toBeNull();

    const { result } = applyNightAction(ctx, step, 'p1', { type: 'acknowledge' });
    expect(result.message).toContain('only Mason among the players');
  });

  it('never offers a role its own seat as a target', () => {
    const dealt: Record<string, RoleId> = { p1: 'seer', p2: 'robber', p3: 'troublemaker' };
    const center: RoleId[] = ['werewolf', 'villager', 'villager'];
    const ctx = makeCtx(dealt, center);
    const steps = buildNightSequence(deckOf(dealt, center), dealt, ['p1', 'p2', 'p3']);

    for (const [role, actor] of [
      ['seer', 'p1'],
      ['robber', 'p2'],
      ['troublemaker', 'p3'],
    ] as const) {
      const turn = buildNightTurn(ctx, stepFor(steps, role), actor, steps.length, 0);
      expect(turn.targetablePlayerIds).not.toContain(actor);
      expect(turn.targetablePlayerIds).toHaveLength(2);
    }
  });

  it('reveals nothing to the Drunk — the whole point of the role', () => {
    const dealt: Record<string, RoleId> = { p1: 'drunk', p2: 'werewolf', p3: 'villager' };
    const center: RoleId[] = ['seer', 'robber', 'villager'];
    const ctx = makeCtx(dealt, center);
    const steps = buildNightSequence(deckOf(dealt, center), dealt, ['p1', 'p2', 'p3']);

    const { result } = applyNightAction(ctx, stepFor(steps, 'drunk'), 'p1', {
      type: 'drunk_swap',
      center: 0,
    });
    expect(result.revealed).toEqual([]);
    expect(result.ownRole).toBeNull();
    expect(seats(ctx).p1).toBe('seer'); // took it, but was never told
  });
});

describe('individual night actions', () => {
  const base: Record<string, RoleId> = {
    p1: 'seer',
    p2: 'robber',
    p3: 'troublemaker',
    p4: 'drunk',
    p5: 'werewolf',
  };
  const baseCenter: RoleId[] = ['villager', 'minion', 'insomniac'];
  const build = () => {
    const ctx = makeCtx(base, baseCenter);
    const steps = buildNightSequence(deckOf(base, baseCenter), base, [
      'p1',
      'p2',
      'p3',
      'p4',
      'p5',
    ]);
    return { ctx, steps };
  };

  it('lets the Seer look at one player', () => {
    const { ctx, steps } = build();
    const { result } = applyNightAction(ctx, stepFor(steps, 'seer'), 'p1', {
      type: 'seer_player',
      targetId: 'p5',
    });
    expect(result.revealed).toEqual([
      { position: { kind: 'player', playerId: 'p5' }, label: 'P5', role: 'werewolf' },
    ]);
    expect(seats(ctx)).toEqual(base); // looking moves nothing
  });

  it('lets the Seer look at two center cards', () => {
    const { ctx, steps } = build();
    const { result } = applyNightAction(ctx, stepFor(steps, 'seer'), 'p1', {
      type: 'seer_center',
      centers: [2, 0],
    });
    expect(result.revealed.map((c) => c.role)).toEqual(['villager', 'insomniac']);
    expect(result.revealed.map((c) => c.label)).toEqual(['Center 1', 'Center 3']);
  });

  it('rejects a Seer peeking at fewer or more than two center cards', () => {
    const { ctx, steps } = build();
    const step = stepFor(steps, 'seer');
    expect(() =>
      applyNightAction(ctx, step, 'p1', { type: 'seer_center', centers: [1] })
    ).toThrow(NightActionError);
    expect(() =>
      applyNightAction(ctx, step, 'p1', { type: 'seer_center', centers: [0, 1, 2] })
    ).toThrow(/exactly two/);
    // Duplicates collapse to one, which is also not two.
    expect(() =>
      applyNightAction(ctx, step, 'p1', { type: 'seer_center', centers: [1, 1] })
    ).toThrow(/exactly two/);
    expect(() =>
      applyNightAction(ctx, step, 'p1', { type: 'seer_center', centers: [0, 7] })
    ).toThrow(/between 1 and 3/);
  });

  it('swaps and reveals for the Robber, and the target becomes the Robber', () => {
    const { ctx, steps } = build();
    const { result } = applyNightAction(ctx, stepFor(steps, 'robber'), 'p2', {
      type: 'robber_rob',
      targetId: 'p5',
    });
    expect(result.ownRole).toBe('werewolf');
    expect(seats(ctx).p2).toBe('werewolf');
    expect(seats(ctx).p5).toBe('robber');
  });

  it('leaves the Robber as the Robber when they decline', () => {
    const { ctx, steps } = build();
    const { result } = applyNightAction(ctx, stepFor(steps, 'robber'), 'p2', { type: 'skip' });
    expect(result.ownRole).toBe('robber');
    expect(seats(ctx)).toEqual(base);
  });

  it('swaps two others for the Troublemaker without revealing anything', () => {
    const { ctx, steps } = build();
    const { result } = applyNightAction(ctx, stepFor(steps, 'troublemaker'), 'p3', {
      type: 'troublemaker_swap',
      targetIds: ['p1', 'p5'],
    });
    expect(result.revealed).toEqual([]);
    expect(result.ownRole).toBeNull();
    expect(seats(ctx).p1).toBe('werewolf');
    expect(seats(ctx).p5).toBe('seer');
    expect(seats(ctx).p3).toBe('troublemaker'); // untouched
  });

  it('stops the Troublemaker from including itself or picking one player twice', () => {
    const { ctx, steps } = build();
    const step = stepFor(steps, 'troublemaker');
    expect(() =>
      applyNightAction(ctx, step, 'p3', { type: 'troublemaker_swap', targetIds: ['p3', 'p1'] })
    ).toThrow(/cannot target yourself/);
    expect(() =>
      applyNightAction(ctx, step, 'p3', { type: 'troublemaker_swap', targetIds: ['p1', 'p1'] })
    ).toThrow(/exactly two different/);
    expect(() =>
      applyNightAction(ctx, step, 'p3', { type: 'troublemaker_swap', targetIds: ['p1', 'ghost'] })
    ).toThrow(/not in this game/);
  });

  it('forces the Drunk to swap and refuses a pass', () => {
    const { ctx, steps } = build();
    const step = stepFor(steps, 'drunk');
    expect(() => applyNightAction(ctx, step, 'p4', { type: 'skip' })).toThrow(/required/);
    applyNightAction(ctx, step, 'p4', { type: 'drunk_swap', center: 1 });
    expect(seats(ctx).p4).toBe('minion');
    expect(centerOf(ctx)).toEqual(['villager', 'drunk', 'insomniac']);
  });

  it('lets a lone Werewolf peek at exactly one center card', () => {
    const dealt: Record<string, RoleId> = { p1: 'werewolf', p2: 'seer', p3: 'villager' };
    const center: RoleId[] = ['werewolf', 'robber', 'villager'];
    const ctx = makeCtx(dealt, center);
    const steps = buildNightSequence(deckOf(dealt, center), dealt, ['p1', 'p2', 'p3']);
    const { result } = applyNightAction(ctx, stepFor(steps, 'werewolf'), 'p1', {
      type: 'werewolf_center',
      center: 0,
    });
    expect(result.revealed.map((c) => c.role)).toEqual(['werewolf']);
    expect(seats(ctx)).toEqual(dealt);
  });

  it('rejects actions from a player whose step it is not', () => {
    const { ctx, steps } = build();
    expect(() =>
      applyNightAction(ctx, stepFor(steps, 'seer'), 'p2', { type: 'seer_player', targetId: 'p1' })
    ).toThrow(/not your turn/);
  });

  it('rejects an action of the wrong shape for the role', () => {
    const { ctx, steps } = build();
    expect(() =>
      applyNightAction(ctx, stepFor(steps, 'seer'), 'p1', { type: 'robber_rob', targetId: 'p2' })
    ).toThrow(/Invalid Seer action/);
  });
});

describe('role-swap resolution chains', () => {
  it('resolves a Robber -> Troublemaker -> Drunk chain in wake order', () => {
    // p1 Robber, p2 Werewolf, p3 Troublemaker, p4 Drunk, p5 Insomniac.
    const dealt: Record<string, RoleId> = {
      p1: 'robber',
      p2: 'werewolf',
      p3: 'troublemaker',
      p4: 'drunk',
      p5: 'insomniac',
    };
    const center: RoleId[] = ['villager', 'seer', 'minion'];
    const ctx = makeCtx(dealt, center);
    const order = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const steps = buildNightSequence(deckOf(dealt, center), dealt, order);

    // 1. Lone Werewolf peeks at a center card (moves nothing).
    applyNightAction(ctx, stepFor(steps, 'werewolf'), 'p2', { type: 'werewolf_center', center: 0 });
    // 2. Seer step exists but is a decoy — the Seer card is in the center.
    expect(stepFor(steps, 'seer').actorIds).toEqual([]);
    // 3. Robber robs the Werewolf and becomes it.
    const rob = applyNightAction(ctx, stepFor(steps, 'robber'), 'p1', {
      type: 'robber_rob',
      targetId: 'p2',
    });
    expect(rob.result.ownRole).toBe('werewolf');
    // 4. Troublemaker swaps p1 (now Werewolf) with p4 (Drunk), sight unseen.
    applyNightAction(ctx, stepFor(steps, 'troublemaker'), 'p3', {
      type: 'troublemaker_swap',
      targetIds: ['p1', 'p4'],
    });
    expect(seats(ctx).p1).toBe('drunk');
    expect(seats(ctx).p4).toBe('werewolf');
    // 5. The Drunk still acts (dealt role decides that) and trades away the
    //    Werewolf card it is now unknowingly holding.
    applyNightAction(ctx, stepFor(steps, 'drunk'), 'p4', { type: 'drunk_swap', center: 1 });
    // 6. Insomniac checks and is untouched.
    const insomnia = applyNightAction(ctx, stepFor(steps, 'insomniac'), 'p5', {
      type: 'acknowledge',
    });

    expect(seats(ctx)).toEqual({
      p1: 'drunk',
      p2: 'robber',
      p3: 'troublemaker',
      p4: 'seer',
      p5: 'insomniac',
    });
    expect(centerOf(ctx)).toEqual(['villager', 'werewolf', 'minion']);
    expect(insomnia.result.ownRole).toBe('insomniac');
  });

  it('shows a robbed Insomniac their new card, not the Insomniac', () => {
    const dealt: Record<string, RoleId> = {
      p1: 'robber',
      p2: 'insomniac',
      p3: 'werewolf',
    };
    const center: RoleId[] = ['seer', 'villager', 'villager'];
    const ctx = makeCtx(dealt, center);
    const steps = buildNightSequence(deckOf(dealt, center), dealt, ['p1', 'p2', 'p3']);

    applyNightAction(ctx, stepFor(steps, 'robber'), 'p1', { type: 'robber_rob', targetId: 'p2' });
    const { result } = applyNightAction(ctx, stepFor(steps, 'insomniac'), 'p2', {
      type: 'acknowledge',
    });

    expect(result.ownRole).toBe('robber');
    expect(result.message).toContain('you are now the Robber');
  });

  it('has the Troublemaker move a card the Robber already stole', () => {
    const dealt: Record<string, RoleId> = {
      p1: 'robber',
      p2: 'troublemaker',
      p3: 'werewolf',
      p4: 'villager',
    };
    const center: RoleId[] = ['seer', 'villager', 'minion'];
    const ctx = makeCtx(dealt, center);
    const steps = buildNightSequence(deckOf(dealt, center), dealt, ['p1', 'p2', 'p3', 'p4']);

    applyNightAction(ctx, stepFor(steps, 'robber'), 'p1', { type: 'robber_rob', targetId: 'p3' });
    // p1 believes it is the Werewolf...
    expect(seats(ctx).p1).toBe('werewolf');
    applyNightAction(ctx, stepFor(steps, 'troublemaker'), 'p2', {
      type: 'troublemaker_swap',
      targetIds: ['p1', 'p4'],
    });
    // ...but it ends the night as a Villager, and p4 is the Werewolf.
    expect(seats(ctx).p1).toBe('villager');
    expect(seats(ctx).p4).toBe('werewolf');
  });

  it('conserves every card in the deck no matter how many swaps happen', () => {
    const dealt: Record<string, RoleId> = {
      p1: 'robber',
      p2: 'troublemaker',
      p3: 'drunk',
      p4: 'werewolf',
      p5: 'seer',
    };
    const center: RoleId[] = ['villager', 'minion', 'insomniac'];
    const deck = deckOf(dealt, center);
    const ctx = makeCtx(dealt, center);
    const steps = buildNightSequence(deck, dealt, ['p1', 'p2', 'p3', 'p4', 'p5']);

    applyNightAction(ctx, stepFor(steps, 'werewolf'), 'p4', { type: 'werewolf_center', center: 2 });
    applyNightAction(ctx, stepFor(steps, 'seer'), 'p5', { type: 'seer_center', centers: [0, 1] });
    applyNightAction(ctx, stepFor(steps, 'robber'), 'p1', { type: 'robber_rob', targetId: 'p4' });
    applyNightAction(ctx, stepFor(steps, 'troublemaker'), 'p2', {
      type: 'troublemaker_swap',
      targetIds: ['p1', 'p3'],
    });
    applyNightAction(ctx, stepFor(steps, 'drunk'), 'p3', { type: 'drunk_swap', center: 0 });

    const onBoard = [...Object.values(seats(ctx)), ...centerOf(ctx)].sort();
    expect(onBoard).toEqual(deck.slice().sort());
  });
});

describe('auto actions for timeouts and disconnects', () => {
  it('passes on every optional step', () => {
    const dealt: Record<string, RoleId> = {
      p1: 'seer',
      p2: 'robber',
      p3: 'troublemaker',
      p4: 'werewolf',
      p5: 'insomniac',
    };
    const center: RoleId[] = ['drunk', 'minion', 'villager'];
    const steps = buildNightSequence(deckOf(dealt, center), dealt, [
      'p1',
      'p2',
      'p3',
      'p4',
      'p5',
    ]);

    expect(autoNightAction(stepFor(steps, 'seer'))).toEqual({ type: 'skip' });
    expect(autoNightAction(stepFor(steps, 'robber'))).toEqual({ type: 'skip' });
    expect(autoNightAction(stepFor(steps, 'troublemaker'))).toEqual({ type: 'skip' });
    expect(autoNightAction(stepFor(steps, 'insomniac'))).toEqual({ type: 'acknowledge' });
  });

  it('picks a center card for the Drunk, whose swap cannot be skipped', () => {
    const dealt: Record<string, RoleId> = { p1: 'drunk', p2: 'werewolf', p3: 'villager' };
    const center: RoleId[] = ['seer', 'robber', 'villager'];
    const steps = buildNightSequence(deckOf(dealt, center), dealt, ['p1', 'p2', 'p3']);
    const action = autoNightAction(stepFor(steps, 'drunk'));
    expect(action.type).toBe('drunk_swap');
    if (action.type === 'drunk_swap') {
      expect([0, 1, 2]).toContain(action.center);
    }
  });

  it('produces an action every step will accept', () => {
    const dealt: Record<string, RoleId> = {
      p1: 'seer',
      p2: 'robber',
      p3: 'troublemaker',
      p4: 'drunk',
      p5: 'werewolf',
      p6: 'insomniac',
      p7: 'mason',
      p8: 'minion',
    };
    const center: RoleId[] = ['mason', 'villager', 'tanner'];
    const order = Object.keys(dealt);
    const ctx = makeCtx(dealt, center);
    const steps = buildNightSequence(deckOf(dealt, center), dealt, order);

    for (const step of steps) {
      for (const actorId of step.actorIds) {
        expect(() => applyNightAction(ctx, step, actorId, autoNightAction(step))).not.toThrow();
      }
    }
  });
});
