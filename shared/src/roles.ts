import type { RoleDef, RoleId, Team } from './types';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 10;
/** Cards left face-down in the middle, always three. */
export const CENTER_COUNT = 3;

export const ROLES: Record<RoleId, RoleDef> = {
  werewolf: {
    id: 'werewolf',
    name: 'Werewolf',
    team: 'werewolf',
    maxCount: 2,
    nightOrder: 1,
    glyph: '🐺',
    blurb: 'Wake and see the other Werewolves.',
    ability:
      'Werewolves wake together and learn who the other Werewolves are. A lone Werewolf may instead peek at one center card.',
    nightAbility:
      'All Werewolves open their eyes and see each other. If you are the only Werewolf dealt to a player, you may look at one center card instead.',
    tutorial:
      'You are on the Werewolf team. You win if no player who is a Werewolf at the end of the game gets voted out — so blend in, sow doubt, and get the village to kill someone innocent.',
  },
  minion: {
    id: 'minion',
    name: 'Minion',
    team: 'werewolf',
    maxCount: 1,
    nightOrder: 2,
    glyph: '👹',
    blurb: 'Learn who the Werewolves are.',
    ability:
      'The Minion learns who the Werewolves are, but the Werewolves do not learn who the Minion is. The Minion wins with the Werewolf team.',
    nightAbility:
      'The Werewolves put their thumbs up and you see who they are. They will not know you exist.',
    tutorial:
      'You win with the Werewolves even though you are not one. You are not a Werewolf yourself, so you being voted out does not cost your team the game — throwing yourself under the bus to protect a Werewolf is a winning play.',
  },
  mason: {
    id: 'mason',
    name: 'Mason',
    team: 'village',
    maxCount: 2,
    nightOrder: 3,
    glyph: '🧱',
    blurb: 'Wake and see the other Mason.',
    ability:
      'The Masons wake together and see each other. If you see no other Mason, the other Mason card is in the center.',
    nightAbility:
      'Open your eyes and look for the other Mason. If nobody else is awake, the other Mason card is one of the center cards.',
    tutorial:
      'You have a confirmed ally (or confirmed proof nobody else is a Mason). This is strong village information — but claiming it early paints a target on you.',
  },
  seer: {
    id: 'seer',
    name: 'Seer',
    team: 'village',
    maxCount: 1,
    nightOrder: 4,
    glyph: '🔮',
    blurb: "Look at a player's card, or two center cards.",
    ability:
      "The Seer may look at one other player's card, or at two of the three center cards.",
    nightAbility:
      "Choose one: peek at one other player's current card, or peek at two of the three center cards.",
    tutorial:
      'You get the best raw information in the game. Remember: you see cards as they are *right now* — a later Robber or Troublemaker can still move the card you looked at.',
  },
  robber: {
    id: 'robber',
    name: 'Robber',
    team: 'village',
    maxCount: 1,
    nightOrder: 5,
    glyph: '🗡️',
    blurb: 'Swap your card with a player, then look at it.',
    ability:
      "The Robber may swap their card with another player's card, then look at their new card. The Robber becomes that role.",
    nightAbility:
      "Optionally swap your card with another player's, then look at what you took. You are now that role; they are now the Robber.",
    tutorial:
      'If you rob a Werewolf, you *become* the Werewolf and win with the Werewolf team. If you decline to rob, you stay the Robber — which is a Village role.',
  },
  troublemaker: {
    id: 'troublemaker',
    name: 'Troublemaker',
    team: 'village',
    maxCount: 1,
    nightOrder: 6,
    glyph: '🌀',
    blurb: "Swap two other players' cards, sight unseen.",
    ability:
      "The Troublemaker may swap the cards of two other players without looking at either card.",
    nightAbility:
      "Optionally pick two other players and swap their cards. You do not get to see either card.",
    tutorial:
      'You learn nothing, but you know two specific players had their roles exchanged. That is powerful once people start claiming roles out loud.',
  },
  drunk: {
    id: 'drunk',
    name: 'Drunk',
    team: 'village',
    maxCount: 1,
    nightOrder: 7,
    glyph: '🍺',
    blurb: 'Must swap with a center card, sight unseen.',
    ability:
      'The Drunk must swap their card with one of the three center cards, without looking at the new card.',
    nightAbility:
      'You must swap your card with a center card of your choice. You do not get to see what you took.',
    tutorial:
      'You have no idea what you are by the end of the night — you could be anything, including a Werewolf. Say so honestly and let the table reason about it.',
  },
  insomniac: {
    id: 'insomniac',
    name: 'Insomniac',
    team: 'village',
    maxCount: 1,
    nightOrder: 8,
    glyph: '👁️',
    blurb: 'Look at your own card at the end of the night.',
    ability:
      'At the very end of the night the Insomniac looks at their own card to see whether it changed.',
    nightAbility:
      'Look at your own card. If it is no longer the Insomniac, someone moved it during the night.',
    tutorial:
      'You are the only role that knows its own final card for certain. If you are still the Insomniac, nobody robbed or troublemade you.',
  },
  tanner: {
    id: 'tanner',
    name: 'Tanner',
    team: 'tanner',
    maxCount: 1,
    nightOrder: null,
    glyph: '🪓',
    blurb: 'Wins alone — only if you get killed.',
    ability:
      'The Tanner hates their job and wins alone if they are killed by the vote. The Tanner is not on the Village or Werewolf team.',
    nightAbility: null,
    tutorial:
      'Your goal is to get yourself voted out. Act suspicious enough to draw votes, but not so obviously that people realise you are the Tanner and spare you.',
  },
  hunter: {
    id: 'hunter',
    name: 'Hunter',
    team: 'village',
    maxCount: 1,
    nightOrder: null,
    glyph: '🏹',
    blurb: 'If killed, whoever you voted for dies too.',
    ability:
      'If the Hunter is killed by the vote, the player the Hunter voted for is also killed, regardless of how many votes that player received.',
    nightAbility: null,
    tutorial:
      'Your vote is a loaded weapon. Announcing that you are the Hunter makes people afraid to vote you — and makes your vote a public threat.',
  },
  villager: {
    id: 'villager',
    name: 'Villager',
    team: 'village',
    maxCount: 3,
    nightOrder: null,
    glyph: '🧑‍🌾',
    blurb: 'No ability. Pure deduction.',
    ability:
      'The Villager has no special ability and never wakes. Being a confirmed Villager is itself useful information.',
    nightAbility: null,
    tutorial:
      'You have no information, which means you are free to be trusted. Listen for contradictions between role claims — that is your whole toolkit.',
  },
};

/** Every role that has a night step, in wake order. */
export const NIGHT_ORDER: RoleId[] = (Object.values(ROLES) as RoleDef[])
  .filter((r) => r.nightOrder !== null)
  .sort((a, b) => (a.nightOrder as number) - (b.nightOrder as number))
  .map((r) => r.id);

/** Stable display order for lobby role pickers and the rules reference. */
export const ROLE_DISPLAY_ORDER: RoleId[] = [
  'werewolf',
  'minion',
  'mason',
  'seer',
  'robber',
  'troublemaker',
  'drunk',
  'insomniac',
  'tanner',
  'hunter',
  'villager',
];

export const ALL_ROLE_IDS = ROLE_DISPLAY_ORDER;

export function roleDef(id: RoleId): RoleDef {
  const def = ROLES[id];
  if (!def) throw new Error(`Unknown role: ${id}`);
  return def;
}

export function roleName(id: RoleId): string {
  return roleDef(id).name;
}

export function teamOf(id: RoleId): Team {
  return roleDef(id).team;
}

export function isRoleId(value: unknown): value is RoleId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ROLES, value);
}

export const TEAM_LABEL: Record<Team, string> = {
  village: 'Village',
  werewolf: 'Werewolf',
  tanner: 'Tanner',
};
