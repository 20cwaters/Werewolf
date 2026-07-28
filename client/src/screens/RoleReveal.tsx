import { useEffect, useState } from 'react';
import { ROLES } from '@onuw/shared';
import { useGame } from '../lib/useGame';
import { useCountdown } from '../lib/useCountdown';
import { Button, CardBack, Panel, TeamBadge, TimerBar, cx } from '../components/ui';

/**
 * The one dramatic look at your card. Tap to flip; the card stays visible until
 * the reveal timer runs out, then the night begins whether or not you looked.
 */
export function RoleReveal() {
  const { state, me, setReady } = useGame();
  const room = state.room;
  const role = state.dealtRole;
  const { seconds, fraction } = useCountdown(room?.revealEndsAt ?? null);
  const [flipped, setFlipped] = useState(false);

  // A reconnect mid-reveal should not re-hide a card the player already saw.
  useEffect(() => {
    if (me?.ready) setFlipped(true);
  }, [me?.ready]);

  if (!room || !role) {
    return (
      <div className="flex min-h-full items-center justify-center px-4">
        <Panel className="text-center text-sm text-mist-300">Dealing the cards…</Panel>
      </div>
    );
  }

  const def = ROLES[role];
  const waitingOn = room.players.filter((p) => !p.isBot && p.connected && !p.ready);

  return (
    <div className="safe-x safe-bottom mx-auto flex min-h-full w-full max-w-md flex-col px-4 pb-6">
      <div className="pt-2">
        <TimerBar
          fraction={fraction}
          urgent={seconds <= 5}
          label={
            <>
              <span>Look at your card</span>
              <span className="font-display tabular-nums">{seconds}s</span>
            </>
          }
        />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center py-6">
        <p className="mb-4 text-center text-sm leading-relaxed text-mist-300">
          {flipped
            ? 'This is the card you were dealt. It can still change during the night.'
            : 'Shield your screen. Tap the card when nobody else can see it.'}
        </p>

        {/* Flip card */}
        <div className="flip-scene aspect-[3/4] w-full max-w-[17rem]">
          <button
            type="button"
            onClick={() => setFlipped(true)}
            aria-label={flipped ? `Your role: ${def.name}` : 'Reveal your role card'}
            className={cx('flip-card block w-full text-left', flipped && 'is-flipped')}
          >
            <span className="flip-face block">
              <CardBack />
              {!flipped && (
                <span className="absolute inset-x-0 bottom-4 text-center text-xs tracking-[0.2em] text-moon-300 uppercase">
                  tap to reveal
                </span>
              )}
            </span>

            <span className="flip-face flip-face-back block">
              <span className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-xl border border-moon-300/40 bg-gradient-to-b from-night-700 to-night-950 p-5 text-center">
                <span className="text-6xl leading-none" aria-hidden>
                  {def.glyph}
                </span>
                <span className="font-display text-3xl text-moon-100">{def.name}</span>
                <TeamBadge team={def.team} />
                <span className="text-sm leading-snug text-mist-200">{def.ability}</span>
              </span>
            </span>
          </button>
        </div>

        {flipped && state.tutorial && (
          <Panel className="mt-4 border-moon-300/40 bg-moon-300/5">
            <p className="text-xs tracking-[0.18em] text-moon-300 uppercase">Tutorial</p>
            <p className="mt-1.5 text-sm leading-relaxed text-mist-200">{def.tutorial}</p>
          </Panel>
        )}
      </div>

      <div className="space-y-2">
        <Button size="lg" full disabled={!flipped || me?.ready} onClick={() => setReady(true)}>
          {me?.ready ? 'Waiting for the table…' : flipped ? "I've memorised it" : 'Reveal your card first'}
        </Button>
        {waitingOn.length > 0 && me?.ready && (
          <p className="text-center text-xs text-mist-400">
            Waiting on {waitingOn.map((p) => p.name).join(', ')}.
          </p>
        )}
      </div>
    </div>
  );
}
