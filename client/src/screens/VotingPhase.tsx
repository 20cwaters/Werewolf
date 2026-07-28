import { useState } from 'react';
import { useGame } from '../lib/useGame';
import { formatClock, useCountdown } from '../lib/useCountdown';
import { Button, Panel, Pill, SectionTitle, TimerBar, cx } from '../components/ui';

/**
 * Simultaneous, private voting. Choices are held locally until confirmed, then
 * only the *fact* that a vote was cast becomes public — nobody sees a target
 * until every vote reveals together on the results screen.
 */
export function VotingPhase() {
  const { state, players, castVote } = useGame();
  const room = state.room;
  const { seconds, fraction } = useCountdown(room?.voting?.endsAt ?? null);
  const [pick, setPick] = useState<string | null>(null);

  if (!room?.voting) return null;

  const myId = state.session?.playerId;
  const locked = !!state.myVote;
  const votedIds = new Set(room.voting.votedIds);
  const selected = state.myVote ?? pick;

  return (
    <div className="safe-x safe-bottom mx-auto flex min-h-full w-full max-w-md flex-col px-4 pb-6">
      <div className="pt-2">
        <TimerBar
          fraction={fraction}
          urgent={seconds <= 10}
          label={
            <>
              <span>Voting</span>
              <span className="font-display tabular-nums">{formatClock(seconds)}</span>
            </>
          }
        />
      </div>

      <div className="flex-1 py-4">
        <div className="mb-4 text-center">
          <h1 className="font-display text-2xl text-moon-100">
            {locked ? 'Vote locked in' : 'Who is the Werewolf?'}
          </h1>
          <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-mist-300">
            {locked
              ? 'Nobody can see your choice until every vote is revealed at once.'
              : 'Tap a player, then confirm. You may vote for yourself.'}
          </p>
        </div>

        <SectionTitle hint={`${room.voting.votedIds.length} of ${players.length} voted`}>
          The table
        </SectionTitle>

        <ul className="space-y-2">
          {players.map((player) => {
            const isSelected = selected === player.id;
            const isMe = player.id === myId;
            return (
              <li key={player.id}>
                <button
                  type="button"
                  disabled={locked}
                  aria-pressed={isSelected}
                  onClick={() => setPick(isSelected ? null : player.id)}
                  className={cx(
                    'flex min-h-16 w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors',
                    isSelected
                      ? 'border-blood-500 bg-blood-500/20'
                      : 'border-night-600/70 bg-night-900/60 active:bg-night-800',
                    locked && !isSelected && 'opacity-50'
                  )}
                >
                  <span
                    aria-hidden
                    className={cx(
                      'flex size-10 shrink-0 items-center justify-center rounded-full font-display text-sm',
                      isSelected ? 'bg-blood-500 text-moon-50' : 'bg-night-700 text-moon-200'
                    )}
                  >
                    {player.seat + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-medium text-moon-100">{player.name}</span>
                      {isMe && <Pill tone="neutral">you</Pill>}
                      {player.isBot && <Pill tone="mist">bot</Pill>}
                      {!player.connected && !player.isBot && <Pill tone="blood">offline</Pill>}
                    </span>
                  </span>
                  {votedIds.has(player.id) ? (
                    <Pill tone="moss">voted</Pill>
                  ) : (
                    <Pill tone="mist">thinking</Pill>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {state.tutorial && !locked && (
          <Panel className="mt-4 border-moon-300/40 bg-moon-300/5">
            <p className="text-xs tracking-[0.18em] text-moon-300 uppercase">Tutorial</p>
            <p className="mt-1.5 text-sm leading-relaxed text-mist-200">
              Ties kill everyone tied, so a scattered vote can wipe out several players. If you are
              the Hunter and you die, whoever you voted for dies with you — so choose carefully.
            </p>
          </Panel>
        )}
      </div>

      <div className="space-y-2">
        {locked ? (
          <Panel className="text-center text-sm text-mist-300">
            Waiting for the rest of the table…
          </Panel>
        ) : (
          <Button
            size="lg"
            full
            variant="danger"
            disabled={!pick}
            onClick={() => pick && castVote(pick)}
          >
            {pick
              ? `Vote for ${players.find((p) => p.id === pick)?.name}`
              : 'Select a player to vote'}
          </Button>
        )}
      </div>
    </div>
  );
}
