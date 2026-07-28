import { ROLES } from '@onuw/shared';
import { useGame } from '../lib/useGame';
import { Button, Modal, Pill, RoleCard, cx } from './ui';

/**
 * The player's private night notes. Everything here was legitimately shown to
 * this player only — it is never broadcast, so it is safe to reopen at any time.
 */
export function Journal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state } = useGame();

  return (
    <Modal open={open} onClose={onClose} title="Your night notes" labelledBy="journal-title">
      {state.knownRole && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-moon-300/40 bg-moon-300/5 p-3">
          <span className="text-3xl leading-none" aria-hidden>
            {ROLES[state.knownRole].glyph}
          </span>
          <div className="min-w-0">
            <p className="text-xs tracking-[0.16em] text-moon-300 uppercase">
              {state.dealtRole === state.knownRole ? 'Your card' : 'Your card now'}
            </p>
            <p className="font-display text-lg text-moon-100">{ROLES[state.knownRole].name}</p>
            {state.dealtRole && state.dealtRole !== state.knownRole && (
              <p className="mt-0.5 text-xs text-mist-400">
                You were dealt the {ROLES[state.dealtRole].name}.
              </p>
            )}
          </div>
        </div>
      )}

      {/* The Drunk is the one role that genuinely cannot know. */}
      {state.dealtRole === 'drunk' && state.knownRole === 'drunk' && (
        <div className="mb-4 rounded-xl border border-blood-500/40 bg-blood-500/10 p-3 text-sm leading-relaxed text-moon-100">
          You swapped with a center card without looking. Your card could be anything now — including
          a Werewolf.
        </div>
      )}

      {state.journal.length === 0 ? (
        <p className="text-sm text-mist-300">
          Nothing yet. Anything you learn during the night shows up here.
        </p>
      ) : (
        <ol className="space-y-2">
          {state.journal.map((entry, i) => (
            <li
              key={entry.id}
              className={cx(
                'rounded-xl border p-3',
                i === state.journal.length - 1
                  ? 'border-moon-300/30 bg-night-800/70'
                  : 'border-night-700/60 bg-night-900/50'
              )}
            >
              <p className="text-sm leading-snug text-mist-100">{entry.text}</p>
              {entry.revealed.length > 0 && (
                <ul className="mt-2 grid grid-cols-3 gap-2">
                  {entry.revealed.map((card, j) => (
                    <li key={j}>
                      <RoleCard
                        role={card.role}
                        size="sm"
                        caption={
                          <span className="mt-0.5 text-[0.65rem] tracking-wide text-mist-400 uppercase">
                            {card.label}
                          </span>
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}

      <p className="mt-4 text-xs leading-relaxed text-mist-400">
        Remember: anything you saw was true at the moment you saw it. A later Robber, Troublemaker or
        Drunk can have moved that card since.
      </p>
    </Modal>
  );
}

export function JournalButton({ onClick }: { onClick: () => void }) {
  const { state } = useGame();
  return (
    <Button variant="ghost" size="sm" onClick={onClick} aria-label="Open your private night notes">
      <span aria-hidden>🗒️</span> Notes
      {state.journal.length > 0 && (
        <Pill tone="moon" className="!px-1.5 !py-0 text-[0.65rem]">
          {state.journal.length}
        </Pill>
      )}
    </Button>
  );
}
