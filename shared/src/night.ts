import type {
  CardMap,
  ChoiceKind,
  NightAction,
  NightActionResult,
  NightLogEntry,
  NightStep,
  NightTurn,
  RevealedCard,
  RoleId,
} from './types';
import { CENTER_COUNT, NIGHT_ORDER, ROLES, roleName } from './roles';
import { cardAt, isValidCenterIndex, swapCards } from './positions';
import { pick, type Rng, defaultRng } from './rng';

export class NightActionError extends Error {}

export interface NightPlayer {
  id: string;
  name: string;
}

export interface NightContext {
  /** Seat order. Used for stable actor ordering and label lookup. */
  players: NightPlayer[];
  /** Mutated in place as actions resolve. */
  cards: CardMap;
  /** Dealt roles — decides who acts on which step, never changes. */
  originalRoles: Record<string, RoleId>;
}

// ---------------------------------------------------------------------------
// Sequencing
// ---------------------------------------------------------------------------

function choiceKindFor(role: RoleId, actorCount: number): ChoiceKind {
  switch (role) {
    // A lone Werewolf (the other card is in the center) gets a center peek.
    // Two Werewolves just see each other and go back to sleep.
    case 'werewolf':
      return actorCount === 1 ? 'werewolf_lone_center' : 'none';
    case 'seer':
      return 'seer';
    case 'robber':
      return 'robber';
    case 'troublemaker':
      return 'troublemaker';
    case 'drunk':
      return 'drunk';
    default:
      return 'none';
  }
}

/**
 * Build the night sequence for a round.
 *
 * A step exists for every waking role **present in the deck**, including roles
 * whose every copy landed in the center. Those steps run with no actors and a
 * decoy delay: skipping them outright would tell the whole table that, say, the
 * Seer is in the center, which is exactly the information the night is meant to
 * hide.
 */
export function buildNightSequence(
  deck: readonly RoleId[],
  originalRoles: Record<string, RoleId>,
  playerOrder?: readonly string[]
): NightStep[] {
  const inDeck = new Set(deck);
  const order = playerOrder ?? Object.keys(originalRoles);

  const steps: NightStep[] = [];
  for (const role of NIGHT_ORDER) {
    if (!inDeck.has(role)) continue;
    const actorIds = order.filter((id) => originalRoles[id] === role);
    steps.push({
      index: steps.length,
      role,
      actorIds,
      choiceKind: choiceKindFor(role, actorIds.length),
      mandatory: role === 'drunk',
    });
  }
  return steps;
}

// ---------------------------------------------------------------------------
// Turn payloads
// ---------------------------------------------------------------------------

function nameOf(ctx: NightContext, playerId: string): string {
  return ctx.players.find((p) => p.id === playerId)?.name ?? 'Unknown';
}

function playerReveal(ctx: NightContext, playerId: string): RevealedCard {
  return {
    position: { kind: 'player', playerId },
    label: nameOf(ctx, playerId),
    role: cardAt(ctx.cards, { kind: 'player', playerId }),
  };
}

function centerReveal(ctx: NightContext, index: number): RevealedCard {
  return {
    position: { kind: 'center', index },
    label: `Center ${index + 1}`,
    role: cardAt(ctx.cards, { kind: 'center', index }),
  };
}

function peersFor(ctx: NightContext, step: NightStep, actorId: string) {
  const toPeer = (id: string) => ({ id, name: nameOf(ctx, id) });
  switch (step.role) {
    case 'werewolf':
    case 'mason':
      return step.actorIds.filter((id) => id !== actorId).map(toPeer);
    case 'minion':
      // The Minion sees the Werewolves; the Werewolves never learn the Minion.
      return ctx.players
        .filter((p) => ctx.originalRoles[p.id] === 'werewolf')
        .map((p) => toPeer(p.id));
    default:
      return [];
  }
}

function peersLabelFor(role: RoleId): string | null {
  switch (role) {
    case 'werewolf':
      return 'Fellow Werewolves';
    case 'mason':
      return 'Fellow Masons';
    case 'minion':
      return 'The Werewolves';
    default:
      return null;
  }
}

function targetsFor(ctx: NightContext, step: NightStep, actorId: string): string[] {
  const others = ctx.players.filter((p) => p.id !== actorId).map((p) => p.id);
  switch (step.choiceKind) {
    case 'seer':
    case 'robber':
    case 'troublemaker':
      return others;
    default:
      return [];
  }
}

function copyFor(
  ctx: NightContext,
  step: NightStep,
  actorId: string,
  peerCount: number
): { headline: string; instruction: string } {
  switch (step.role) {
    case 'werewolf':
      return peerCount > 0
        ? {
            headline: 'The pack is awake',
            instruction:
              'These are your fellow Werewolves. Remember them — you win together. Nothing else to do tonight.',
          }
        : {
            headline: 'You howl alone',
            instruction:
              'You are the only Werewolf dealt to a player, so the second Werewolf card is in the center. You may peek at one center card.',
          };
    case 'minion':
      return peerCount > 0
        ? {
            headline: 'You serve the pack',
            instruction:
              'These players are the Werewolves. They do not know you exist. Protect them — you win if no Werewolf is killed.',
          }
        : {
            headline: 'You serve nobody',
            instruction:
              'No player is a Werewolf — both Werewolf cards are in the center. Your team wins as long as no player who ends up a Werewolf is killed, which is already true.',
          };
    case 'mason':
      return peerCount > 0
        ? {
            headline: 'The Masons meet',
            instruction: 'This is your fellow Mason. You can both be certain the other is Village.',
          }
        : {
            headline: 'You wake alone',
            instruction:
              'No other Mason is among the players, so the second Mason card is in the center. Anyone else claiming Mason is lying.',
          };
    case 'seer':
      return {
        headline: 'Gaze into the dark',
        instruction:
          "Look at one other player's card, or two of the three center cards. You see cards as they are right now — later roles can still move them.",
      };
    case 'robber':
      return {
        headline: 'Choose a pocket to pick',
        instruction:
          'You may swap your card with another player, then look at what you took. You become that role. Or steal nothing and stay the Robber.',
      };
    case 'troublemaker':
      return {
        headline: 'Stir the pot',
        instruction:
          'You may swap two other players’ cards. You will not see either card — but you will know those two swapped.',
      };
    case 'drunk':
      return {
        headline: 'You are far too drunk',
        instruction:
          'You must swap your card with a center card. You will not see what you took, so you have no idea what you are by morning.',
      };
    case 'insomniac':
      return {
        headline: 'You never sleep',
        instruction: 'Look at your own card to see whether anyone moved it tonight.',
      };
    default:
      return { headline: roleName(step.role), instruction: 'Nothing to do tonight.' };
  }
}

/** The private payload sent to a single actor when their step begins. */
export function buildNightTurn(
  ctx: NightContext,
  step: NightStep,
  actorId: string,
  totalSteps: number,
  endsAt: number
): NightTurn {
  const peers = peersFor(ctx, step, actorId);
  const copy = copyFor(ctx, step, actorId, peers.length);
  return {
    stepIndex: step.index,
    totalSteps,
    role: step.role,
    choiceKind: step.choiceKind,
    mandatory: step.mandatory,
    endsAt,
    peers,
    peersLabel: peers.length > 0 ? peersLabelFor(step.role) : null,
    revealed: [],
    targetablePlayerIds: targetsFor(ctx, step, actorId),
    headline: copy.headline,
    instruction: copy.instruction,
  };
}

// ---------------------------------------------------------------------------
// Applying actions
// ---------------------------------------------------------------------------

export interface AppliedNightAction {
  /** Private feedback for the acting player. */
  result: NightActionResult;
  /** Public-at-results record of what this step did. */
  log: NightLogEntry;
}

function requireOtherPlayer(ctx: NightContext, actorId: string, targetId: unknown): string {
  if (typeof targetId !== 'string') throw new NightActionError('No target chosen.');
  if (targetId === actorId) throw new NightActionError('You cannot target yourself.');
  if (!ctx.players.some((p) => p.id === targetId)) {
    throw new NightActionError('That player is not in this game.');
  }
  return targetId;
}

function requireCenter(index: unknown): number {
  if (!isValidCenterIndex(index)) {
    throw new NightActionError(`Pick a center card between 1 and ${CENTER_COUNT}.`);
  }
  return index;
}

function isPass(action: NightAction): boolean {
  return action.type === 'skip' || action.type === 'acknowledge';
}

/**
 * Validate and apply one actor's night action, mutating `ctx.cards`.
 *
 * Every action reads the *current* card layout, so ordering matters: the Robber
 * takes whatever the target holds at the Robber's step, and the Drunk trades
 * away whatever ended up in their own seat — even if that is no longer the
 * Drunk card.
 */
export function applyNightAction(
  ctx: NightContext,
  step: NightStep,
  actorId: string,
  action: NightAction
): AppliedNightAction {
  if (!step.actorIds.includes(actorId)) {
    throw new NightActionError('It is not your turn.');
  }
  if (step.mandatory && isPass(action)) {
    throw new NightActionError('This action is required — you must make a choice.');
  }

  const actorName = nameOf(ctx, actorId);
  const self = { kind: 'player' as const, playerId: actorId };
  const revealed: RevealedCard[] = [];
  let ownRole: RoleId | null = null;
  let message = '';
  let logText = '';

  switch (step.role) {
    // -- Werewolves ------------------------------------------------------
    case 'werewolf': {
      if (step.choiceKind === 'werewolf_lone_center' && action.type === 'werewolf_center') {
        const index = requireCenter(action.center);
        const card = centerReveal(ctx, index);
        revealed.push(card);
        message = `Center ${index + 1} is the ${roleName(card.role)}.`;
        logText = `Lone Werewolf ${actorName} peeked at center ${index + 1} (${roleName(card.role)}).`;
      } else if (isPass(action)) {
        const others = step.actorIds.filter((id) => id !== actorId);
        message =
          others.length > 0
            ? `You saw ${others.map((id) => nameOf(ctx, id)).join(' and ')} as fellow Werewolves.`
            : 'You looked at no center card.';
        logText =
          others.length > 0
            ? `Werewolves ${step.actorIds.map((id) => nameOf(ctx, id)).join(' and ')} saw each other.`
            : `Lone Werewolf ${actorName} looked at no center card.`;
      } else {
        throw new NightActionError('Invalid Werewolf action.');
      }
      break;
    }

    // -- Minion ----------------------------------------------------------
    case 'minion': {
      if (!isPass(action)) throw new NightActionError('The Minion makes no choice.');
      const wolves = ctx.players.filter((p) => ctx.originalRoles[p.id] === 'werewolf');
      message =
        wolves.length > 0
          ? `You know the Werewolves: ${wolves.map((p) => p.name).join(', ')}.`
          : 'No player is a Werewolf — both Werewolf cards are in the center.';
      logText = `Minion ${actorName} saw the Werewolves (${
        wolves.length > 0 ? wolves.map((p) => p.name).join(', ') : 'none'
      }).`;
      break;
    }

    // -- Masons ----------------------------------------------------------
    case 'mason': {
      if (!isPass(action)) throw new NightActionError('The Masons make no choice.');
      const others = step.actorIds.filter((id) => id !== actorId);
      message =
        others.length > 0
          ? `Your fellow Mason is ${others.map((id) => nameOf(ctx, id)).join(', ')}.`
          : 'You are the only Mason among the players — the other Mason card is in the center.';
      logText =
        step.actorIds.length > 1
          ? `Masons ${step.actorIds.map((id) => nameOf(ctx, id)).join(' and ')} saw each other.`
          : `Lone Mason ${actorName} confirmed no other Mason is in play.`;
      break;
    }

    // -- Seer ------------------------------------------------------------
    case 'seer': {
      if (action.type === 'seer_player') {
        const targetId = requireOtherPlayer(ctx, actorId, action.targetId);
        const card = playerReveal(ctx, targetId);
        revealed.push(card);
        message = `${card.label} is the ${roleName(card.role)}.`;
        logText = `Seer ${actorName} looked at ${card.label} (${roleName(card.role)}).`;
      } else if (action.type === 'seer_center') {
        const raw = Array.isArray(action.centers) ? action.centers : [];
        const unique = Array.from(new Set(raw.map(requireCenter)));
        if (unique.length !== 2) {
          throw new NightActionError('Pick exactly two different center cards.');
        }
        unique.sort((a, b) => a - b);
        for (const index of unique) revealed.push(centerReveal(ctx, index));
        message = revealed.map((c) => `${c.label} is the ${roleName(c.role)}`).join('; ') + '.';
        logText = `Seer ${actorName} looked at ${revealed
          .map((c) => `${c.label} (${roleName(c.role)})`)
          .join(' and ')}.`;
      } else if (isPass(action)) {
        message = 'You looked at nothing.';
        logText = `Seer ${actorName} looked at nothing.`;
      } else {
        throw new NightActionError('Invalid Seer action.');
      }
      break;
    }

    // -- Robber ----------------------------------------------------------
    case 'robber': {
      if (action.type === 'robber_rob') {
        const targetId = requireOtherPlayer(ctx, actorId, action.targetId);
        const target = { kind: 'player' as const, playerId: targetId };
        const stolen = cardAt(ctx.cards, target);
        const givenAway = cardAt(ctx.cards, self);
        swapCards(ctx.cards, self, target);
        // Read back from the board rather than trusting `stolen`, so the
        // reveal always reflects the post-swap truth.
        ownRole = cardAt(ctx.cards, self);
        revealed.push({ position: self, label: 'You', role: ownRole });
        message = `You robbed ${nameOf(ctx, targetId)} and you are now the ${roleName(ownRole)}.`;
        logText = `Robber ${actorName} swapped with ${nameOf(
          ctx,
          targetId
        )}: took ${roleName(stolen)}, gave ${roleName(givenAway)}.`;
      } else if (isPass(action)) {
        ownRole = cardAt(ctx.cards, self);
        message = 'You robbed nobody. You are still the Robber.';
        logText = `Robber ${actorName} robbed nobody.`;
      } else {
        throw new NightActionError('Invalid Robber action.');
      }
      break;
    }

    // -- Troublemaker ----------------------------------------------------
    case 'troublemaker': {
      if (action.type === 'troublemaker_swap') {
        const raw = Array.isArray(action.targetIds) ? action.targetIds : [];
        const ids = Array.from(new Set(raw.map((id) => requireOtherPlayer(ctx, actorId, id))));
        if (ids.length !== 2) {
          throw new NightActionError('Pick exactly two different players (not yourself).');
        }
        const a = { kind: 'player' as const, playerId: ids[0] };
        const b = { kind: 'player' as const, playerId: ids[1] };
        swapCards(ctx.cards, a, b);
        const names = ids.map((id) => nameOf(ctx, id));
        message = `You swapped ${names[0]} and ${names[1]} without looking.`;
        logText = `Troublemaker ${actorName} swapped ${names[0]} and ${names[1]}.`;
      } else if (isPass(action)) {
        message = 'You swapped nobody.';
        logText = `Troublemaker ${actorName} swapped nobody.`;
      } else {
        throw new NightActionError('Invalid Troublemaker action.');
      }
      break;
    }

    // -- Drunk -----------------------------------------------------------
    case 'drunk': {
      if (action.type !== 'drunk_swap') throw new NightActionError('The Drunk must swap.');
      const index = requireCenter(action.center);
      const center = { kind: 'center' as const, index };
      const taken = cardAt(ctx.cards, center);
      const givenAway = cardAt(ctx.cards, self);
      swapCards(ctx.cards, self, center);
      // Deliberately no reveal and no ownRole: the Drunk does not look.
      message = `You swapped your card with center ${index + 1}. You have no idea what you are now.`;
      logText = `Drunk ${actorName} swapped with center ${index + 1}: took ${roleName(
        taken
      )}, gave ${roleName(givenAway)}.`;
      break;
    }

    // -- Insomniac -------------------------------------------------------
    case 'insomniac': {
      if (!isPass(action)) throw new NightActionError('The Insomniac makes no choice.');
      ownRole = cardAt(ctx.cards, self);
      revealed.push({ position: self, label: 'You', role: ownRole });
      message =
        ownRole === 'insomniac'
          ? 'Your card is still the Insomniac. Nobody moved it.'
          : `Your card changed — you are now the ${roleName(ownRole)}.`;
      logText = `Insomniac ${actorName} checked their card (${roleName(ownRole)}).`;
      break;
    }

    default:
      throw new NightActionError(`${roleName(step.role)} has no night action.`);
  }

  return {
    result: { stepIndex: step.index, role: step.role, revealed, ownRole, message },
    log: { stepIndex: step.index, role: step.role, text: logText },
  };
}

/**
 * What to do for an actor who ran out of time or dropped mid-step: pass on
 * anything optional, and pick a random center card for the Drunk since that
 * swap is mandatory and the game cannot continue without it.
 */
export function autoNightAction(step: NightStep, rng: Rng = defaultRng): NightAction {
  if (step.role === 'drunk') {
    return { type: 'drunk_swap', center: pick([0, 1, 2], rng) };
  }
  return step.choiceKind === 'none' ? { type: 'acknowledge' } : { type: 'skip' };
}

/** Log line for a step nobody was awake for. */
export function phantomStepLog(step: NightStep): NightLogEntry {
  return {
    stepIndex: step.index,
    role: step.role,
    text: `No player held the ${roleName(step.role)} card — the step passed with nobody awake.`,
  };
}

export function stepHasNightAbility(role: RoleId): boolean {
  return ROLES[role].nightOrder !== null;
}

/** Shallow copy of the card layout, for snapshots. */
export function snapshotCards(cards: CardMap): CardMap {
  return { ...cards };
}
