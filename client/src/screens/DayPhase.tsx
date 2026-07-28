import { ROLES } from '@onuw/shared';
import { useGame } from '../lib/useGame';
import { formatClock, useCountdown } from '../lib/useCountdown';
import { Button, Panel, Pill, SectionTitle, TimerBar, cx } from '../components/ui';

/**
 * Shared discussion timer. The talking happens in the room, not in the app —
 * all this screen owns is the clock, the roster, and a way to cut it short when
 * everyone has said their piece.
 */
export function DayPhase() {
  const { state, me, players, setReady } = useGame();
  const room = state.room;
  const { seconds, fraction } = useCountdown(room?.day?.endsAt ?? null);

  if (!room) return null;

  const waitingOn = players.filter((p) => !p.isBot && p.connected && !p.ready);
  const readyCount = players.filter((p) => p.ready).length;
  const urgent = seconds <= 30;

  return (
    <div className="safe-x safe-bottom mx-auto flex min-h-full w-full max-w-md flex-col px-4 pb-6">
      <div className="pt-2">
        <TimerBar
          fraction={fraction}
          urgent={urgent}
          label={
            <>
              <span>Discussion</span>
              <span className="font-display tabular-nums">{formatClock(seconds)}</span>
            </>
          }
        />
      </div>

      <div className="flex flex-1 flex-col justify-center gap-4 py-5">
        <div className="text-center">
          <p className="text-xs tracking-[0.22em] text-moon-300 uppercase">Dawn breaks</p>
          <p
            className={cx(
              'font-display mt-1 text-6xl tabular-nums',
              urgent ? 'text-blood-400' : 'text-moon-100'
            )}
          >
            {formatClock(seconds)}
          </p>
          <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-mist-300">
            Talk it out. Claim a role, question someone else's, and work out who is holding a
            Werewolf card <em>right now</em> — not who was dealt one.
          </p>
        </div>

        {state.knownRole && (
          <Panel className="text-center">
            <SectionTitle>What you know</SectionTitle>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Pill tone="moon">
                <span aria-hidden>{ROLES[state.knownRole].glyph}</span> You are the{' '}
                {ROLES[state.knownRole].name}
              </Pill>
              {state.dealtRole && state.dealtRole !== state.knownRole && (
                <Pill tone="mist">dealt the {ROLES[state.dealtRole].name}</Pill>
              )}
            </div>
            {state.journal.length > 0 && (
              <p className="mt-2 text-xs text-mist-400">
                {state.journal.length} note{state.journal.length === 1 ? '' : 's'} from the night —
                open your notes to review.
              </p>
            )}
          </Panel>
        )}

        {state.tutorial && (
          <Panel className="border-moon-300/40 bg-moon-300/5">
            <p className="text-xs tracking-[0.18em] text-moon-300 uppercase">Tutorial</p>
            <p className="mt-1.5 text-sm leading-relaxed text-mist-200">
              When the timer ends, everyone votes at the same time for who they think is a Werewolf.
              Votes are hidden until they all flip at once. Whoever gets the most votes dies — and if
              that person is currently a Werewolf, the whole Village wins.
            </p>
          </Panel>
        )}
      </div>

      <div className="space-y-2">
        <Button
          size="lg"
          full
          variant={me?.ready ? 'secondary' : 'primary'}
          onClick={() => setReady(!me?.ready)}
        >
          {me?.ready ? 'Wait — I have more to say' : 'Ready to vote'}
        </Button>
        <p className="text-center text-xs text-mist-400">
          {readyCount} of {players.length} ready.
          {waitingOn.length > 0 && me?.ready
            ? ` Waiting on ${waitingOn.map((p) => p.name).join(', ')}.`
            : ' Voting opens early once everyone is ready.'}
        </p>
      </div>
    </div>
  );
}
