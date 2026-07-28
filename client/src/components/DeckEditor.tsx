import {
  ROLES,
  ROLE_DISPLAY_ORDER,
  countTotal,
  suggestRoleCounts,
  totalCardsFor,
  validateRoleCounts,
  type RoleId,
} from '@onuw/shared';
import { Button, Pill, SectionTitle, cx } from './ui';

export type RoleCounts = Partial<Record<RoleId, number>>;

/**
 * Deck builder. The deck must total exactly `players + 3`, so the header keeps a
 * live count and the start button stays disabled until it balances.
 */
export function DeckEditor({
  counts,
  playerCount,
  onChange,
  disabled,
}: {
  counts: RoleCounts;
  playerCount: number;
  onChange: (counts: RoleCounts) => void;
  disabled?: boolean;
}) {
  const required = totalCardsFor(playerCount);
  const total = countTotal(counts);
  const validation = validateRoleCounts(counts, playerCount);
  const remaining = required - total;

  const set = (role: RoleId, value: number) => {
    const next = { ...counts };
    if (value <= 0) delete next[role];
    else next[role] = value;
    onChange(next);
  };

  const capFor = (role: RoleId) =>
    role === 'villager' ? Math.max(required, 13) : ROLES[role].maxCount;

  return (
    <div>
      <SectionTitle
        hint={
          <span
            className={cx(
              'font-semibold',
              remaining === 0 ? 'text-moss-400' : 'text-blood-400'
            )}
          >
            {total} / {required} cards
          </span>
        }
      >
        Deck
      </SectionTitle>

      <p className="mb-3 text-xs leading-relaxed text-mist-400">
        {playerCount} player{playerCount === 1 ? '' : 's'} plus 3 face-down center cards ={' '}
        {required} roles.{' '}
        {remaining > 0
          ? `Add ${remaining} more.`
          : remaining < 0
            ? `Remove ${-remaining}.`
            : 'Balanced.'}
      </p>

      <ul className="space-y-1.5">
        {ROLE_DISPLAY_ORDER.map((role) => {
          const def = ROLES[role];
          const value = counts[role] ?? 0;
          const cap = capFor(role);
          return (
            <li
              key={role}
              className={cx(
                'flex items-center gap-3 rounded-xl border p-2.5 transition-colors',
                value > 0
                  ? 'border-moon-300/30 bg-night-800/70'
                  : 'border-night-700/60 bg-night-900/40'
              )}
            >
              <span className="text-xl leading-none" aria-hidden>
                {def.glyph}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={cx(
                      'font-display text-sm',
                      value > 0 ? 'text-moon-100' : 'text-mist-400'
                    )}
                  >
                    {def.name}
                  </span>
                  {role === 'villager' && <Pill tone="mist">filler</Pill>}
                </div>
                <p className="truncate text-xs text-mist-400">{def.blurb}</p>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={disabled || value <= 0}
                  onClick={() => set(role, value - 1)}
                  aria-label={`Remove one ${def.name}`}
                  className="!min-h-11 !w-11 !px-0 text-lg"
                >
                  −
                </Button>
                <span
                  className="w-6 text-center font-display text-base tabular-nums text-moon-100"
                  aria-label={`${value} ${def.name} in deck`}
                >
                  {value}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={disabled || value >= cap}
                  onClick={() => set(role, value + 1)}
                  aria-label={`Add one ${def.name}`}
                  className="!min-h-11 !w-11 !px-0 text-lg"
                >
                  +
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => onChange(suggestRoleCounts(playerCount))}
        >
          Reset to recommended
        </Button>
      </div>

      {!validation.ok && (
        <ul className="mt-3 space-y-1">
          {validation.errors.map((error) => (
            <li key={error} className="text-xs text-blood-400">
              • {error}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
