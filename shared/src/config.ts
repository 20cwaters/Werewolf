import type { RoomConfig } from './types';
import { sanitizeRoleCounts, suggestRoleCounts } from './deck';

export const TIMER_LIMITS = {
  discussionSeconds: { min: 30, max: 900, default: 300 },
  nightActionSeconds: { min: 10, max: 120, default: 35 },
  voteSeconds: { min: 15, max: 180, default: 45 },
  revealSeconds: { min: 5, max: 60, default: 20 },
} as const;

export function defaultConfig(playerCount: number): RoomConfig {
  return {
    roleCounts: suggestRoleCounts(playerCount),
    discussionSeconds: TIMER_LIMITS.discussionSeconds.default,
    nightActionSeconds: TIMER_LIMITS.nightActionSeconds.default,
    voteSeconds: TIMER_LIMITS.voteSeconds.default,
    revealSeconds: TIMER_LIMITS.revealSeconds.default,
    // Naming the acting role keeps the night readable; it never reveals who
    // holds it. Hosts who want a stricter game can switch this off.
    announceNightRoles: true,
  };
}

function clampSeconds(value: unknown, limits: { min: number; max: number; default: number }): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return limits.default;
  return Math.max(limits.min, Math.min(limits.max, Math.round(value)));
}

/** Merge untrusted client input over an existing config, clamping everything. */
export function mergeConfig(base: RoomConfig, patch: unknown): RoomConfig {
  if (!patch || typeof patch !== 'object') return base;
  const p = patch as Partial<RoomConfig>;
  return {
    roleCounts: p.roleCounts !== undefined ? sanitizeRoleCounts(p.roleCounts) : base.roleCounts,
    discussionSeconds:
      p.discussionSeconds !== undefined
        ? clampSeconds(p.discussionSeconds, TIMER_LIMITS.discussionSeconds)
        : base.discussionSeconds,
    nightActionSeconds:
      p.nightActionSeconds !== undefined
        ? clampSeconds(p.nightActionSeconds, TIMER_LIMITS.nightActionSeconds)
        : base.nightActionSeconds,
    voteSeconds:
      p.voteSeconds !== undefined ? clampSeconds(p.voteSeconds, TIMER_LIMITS.voteSeconds) : base.voteSeconds,
    revealSeconds:
      p.revealSeconds !== undefined
        ? clampSeconds(p.revealSeconds, TIMER_LIMITS.revealSeconds)
        : base.revealSeconds,
    announceNightRoles:
      typeof p.announceNightRoles === 'boolean' ? p.announceNightRoles : base.announceNightRoles,
  };
}
