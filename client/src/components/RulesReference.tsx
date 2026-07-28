import { useState } from 'react';
import { NIGHT_ORDER, ROLES, ROLE_DISPLAY_ORDER, type RoleId } from '@onuw/shared';
import { Button, Modal, Pill, TeamBadge, cx } from './ui';

type Tab = 'roles' | 'night' | 'winning';

/**
 * Always-available rules reference. It is a local overlay only — opening it
 * sends nothing to the server, so it cannot disturb anyone else's game.
 */
export function RulesReference({
  open,
  onClose,
  deck,
}: {
  open: boolean;
  onClose: () => void;
  /** When a round is running, roles in play are marked. */
  deck?: RoleId[] | null;
}) {
  const [tab, setTab] = useState<Tab>('roles');

  const inDeck = new Set(deck ?? []);
  const deckCount = (role: RoleId) => (deck ?? []).filter((r) => r === role).length;
  const nightRoles = NIGHT_ORDER.filter((role) => !deck || inDeck.has(role));

  return (
    <Modal open={open} onClose={onClose} title="Rules reference" labelledBy="rules-title">
      <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-night-900/80 p-1">
        {(
          [
            ['roles', 'Roles'],
            ['night', 'Night order'],
            ['winning', 'Winning'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className={cx(
              'min-h-10 rounded-lg px-2 text-sm font-medium transition-colors',
              tab === id ? 'bg-moon-300 text-night-950' : 'text-mist-300 active:bg-night-800'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'roles' && (
        <ul className="space-y-3">
          {ROLE_DISPLAY_ORDER.map((role) => {
            const def = ROLES[role];
            const count = deckCount(role);
            const dimmed = !!deck && count === 0;
            return (
              <li
                key={role}
                className={cx(
                  'rounded-xl border border-night-600/50 bg-night-900/60 p-3',
                  dimmed && 'opacity-45'
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl leading-none" aria-hidden>
                    {def.glyph}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-base text-moon-100">{def.name}</h3>
                      <TeamBadge team={def.team} />
                      {deck ? (
                        count > 0 ? (
                          <Pill tone="moon">{count} in deck</Pill>
                        ) : (
                          <Pill tone="mist">not in deck</Pill>
                        )
                      ) : (
                        <Pill tone="mist">
                          {def.maxCount} card{def.maxCount === 1 ? '' : 's'}
                        </Pill>
                      )}
                    </div>
                    <p className="mt-1.5 text-sm leading-snug text-mist-200">{def.ability}</p>
                    {def.nightOrder !== null && (
                      <p className="mt-1 text-xs text-mist-400">
                        Wakes at night step {def.nightOrder}.
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {tab === 'night' && (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-mist-200">
            Roles wake in this fixed order. Only roles whose card is in the deck get a step — and a
            step still runs even if every copy of that card is in the center, so a short step never
            gives away where a card ended up.
          </p>
          <ol className="space-y-2">
            {nightRoles.map((role, i) => {
              const def = ROLES[role];
              return (
                <li
                  key={role}
                  className="flex items-start gap-3 rounded-xl border border-night-600/50 bg-night-900/60 p-3"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-moon-300/15 font-display text-sm text-moon-200">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-display text-sm text-moon-100">
                      <span aria-hidden>{def.glyph}</span> {def.name}
                    </h3>
                    <p className="mt-1 text-sm leading-snug text-mist-200">{def.nightAbility}</p>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="text-xs leading-relaxed text-mist-400">
            Roles that never wake: Villager, Tanner and Hunter. Their abilities (or lack of one)
            matter only when the votes are counted.
          </p>
        </div>
      )}

      {tab === 'winning' && (
        <div className="space-y-4 text-sm leading-relaxed text-mist-200">
          <div className="rounded-xl border border-moon-300/30 bg-moon-300/5 p-3">
            <h3 className="font-display text-moon-200">Everything is judged on final roles</h3>
            <p className="mt-1">
              The Robber, Troublemaker and Drunk move cards around during the night. What matters at
              the end is the card sitting in front of you — not the one you were dealt. If you were
              dealt the Robber and stole the Werewolf, you <em>are</em> the Werewolf.
            </p>
          </div>

          <div>
            <h3 className="font-display text-moon-200">Voting</h3>
            <p className="mt-1">
              After discussion, everyone votes at the same time for who they think is a Werewolf. You
              may vote for yourself. All votes are revealed at once, and whoever has the most votes
              is killed. A tie kills everyone tied.
            </p>
          </div>

          <div>
            <h3 className="font-display text-moon-200">The Hunter</h3>
            <p className="mt-1">
              If the Hunter is killed, the player the Hunter voted for is killed too — no matter how
              few votes that player got.
            </p>
          </div>

          <ul className="space-y-2">
            <li className="rounded-xl border border-moss-500/40 bg-moss-500/10 p-3">
              <strong className="text-moss-400">Village wins</strong> if at least one player who is
              currently a Werewolf gets killed. The Village team is everyone except Werewolves, the
              Minion and the Tanner.
            </li>
            <li className="rounded-xl border border-blood-500/40 bg-blood-500/10 p-3">
              <strong className="text-blood-400">Werewolves win</strong> if no player who is
              currently a Werewolf gets killed — including the case where nobody ends up a Werewolf
              at all because both Werewolf cards are in the center. The Minion wins with them.
            </li>
            <li className="rounded-xl border border-moon-300/40 bg-moon-300/10 p-3">
              <strong className="text-moon-200">The Tanner wins alone</strong> if the Tanner is
              killed. This overrides both results above — the Tanner takes the win outright, even if
              a Werewolf died in the same vote.
            </li>
          </ul>
        </div>
      )}
    </Modal>
  );
}

/** Floating rules button, safe to tap at any point in the game. */
export function RulesButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={className}
      aria-label="Open the rules reference"
    >
      <span aria-hidden>📖</span> Rules
    </Button>
  );
}
