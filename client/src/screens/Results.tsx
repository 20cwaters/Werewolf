import { useEffect, useState } from 'react';
import { ROLES, TEAM_LABEL, type GameResult, type PublicPlayer } from '@onuw/shared';
import { useGame } from '../lib/useGame';
import { Button, Panel, Pill, RoleCard, SectionTitle, TeamBadge, cx } from '../components/ui';

export function Results() {
  const { state, players, isHost, playAgain, leaveRoom } = useGame();
  const result = state.results ?? state.room?.results ?? null;
  // Beat of suspense before the verdict lands.
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setRevealed(true), 900);
    return () => window.clearTimeout(id);
  }, []);

  if (!result) {
    return (
      <div className="flex min-h-full items-center justify-center px-4">
        <Panel className="text-center text-sm text-mist-300">Counting the votes…</Panel>
      </div>
    );
  }

  const myId = state.session?.playerId;
  const iWon = !!myId && result.winnerIds.includes(myId);
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? 'Unknown';

  return (
    <div className="safe-x safe-bottom mx-auto w-full max-w-md space-y-4 px-4 pb-6">
      {/* Verdict */}
      <Panel
        className={cx(
          'text-center transition-opacity duration-700',
          revealed ? 'opacity-100' : 'opacity-0',
          result.winningTeam === 'werewolf' && 'border-blood-500/50 bg-blood-500/10',
          result.winningTeam === 'village' && 'border-moss-500/50 bg-moss-500/10',
          result.winningTeam === 'tanner' && 'border-moon-300/60 bg-moon-300/10'
        )}
      >
        <p className="text-xs tracking-[0.24em] text-mist-300 uppercase">
          {result.tannerWin ? 'Special outcome' : 'The vote is counted'}
        </p>
        <h1 className="font-display mt-1 text-3xl leading-tight text-moon-100">
          {result.winningTeam === 'tanner'
            ? 'The Tanner wins alone'
            : `${TEAM_LABEL[result.winningTeam]} team wins`}
        </h1>

        {result.tannerWin && (
          <p className="mt-2 rounded-xl border border-moon-300/40 bg-night-950/50 p-3 text-sm leading-relaxed text-moon-200">
            {result.tannerIds.map(nameOf).join(' and ')} was the Tanner and got killed. That
            overrides everything else — the{' '}
            <strong>{TEAM_LABEL[result.baseWinningTeam]} team</strong> technically met its condition,
            but the Tanner takes the win outright.
          </p>
        )}

        {myId && (
          <p className={cx('mt-3 font-display text-xl', iWon ? 'text-moss-400' : 'text-blood-400')}>
            {iWon ? 'You won.' : 'You lost.'}
          </p>
        )}

        <p className="mt-3 text-sm leading-relaxed text-mist-200">{result.summary}</p>
      </Panel>

      {/* Who died */}
      <Panel>
        <SectionTitle hint={`${result.killedIds.length} killed`}>The killing</SectionTitle>
        {result.killedIds.length === 0 ? (
          <p className="text-sm text-mist-300">Nobody received enough votes to be killed.</p>
        ) : (
          <ul className="space-y-2">
            {result.killedIds.map((id) => {
              const byHunter = result.hunterKills.find((k) => k.targetId === id);
              return (
                <li
                  key={id}
                  className="flex items-center gap-3 rounded-xl border border-blood-500/40 bg-blood-500/10 p-3"
                >
                  <span className="text-2xl leading-none" aria-hidden>
                    {ROLES[result.finalRoles[id]].glyph}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-moon-100">{nameOf(id)}</p>
                    <p className="text-xs text-mist-300">
                      was the {ROLES[result.finalRoles[id]].name} ·{' '}
                      {result.voteCounts[id] ?? 0} vote
                      {(result.voteCounts[id] ?? 0) === 1 ? '' : 's'}
                    </p>
                  </div>
                  {byHunter && <Pill tone="moon">Hunter's shot</Pill>}
                </li>
              );
            })}
          </ul>
        )}

        {result.hunterKills.length > 0 && (
          <div className="mt-3 rounded-xl border border-moon-300/40 bg-moon-300/5 p-3">
            {result.hunterKills.map((kill) => (
              <p key={kill.hunterId} className="text-sm leading-relaxed text-moon-200">
                <span aria-hidden>🏹</span> {nameOf(kill.hunterId)} was the Hunter. Dying, they took{' '}
                {nameOf(kill.targetId)} with them — regardless of the vote count.
              </p>
            ))}
          </div>
        )}
      </Panel>

      {/* Final roles */}
      <Panel>
        <SectionTitle hint="what you actually were">Final roles</SectionTitle>
        <ul className="space-y-2">
          {players.map((player) => (
            <PlayerResultRow
              key={player.id}
              player={player}
              result={result}
              isMe={player.id === myId}
              nameOf={nameOf}
            />
          ))}
        </ul>
      </Panel>

      {/* Center */}
      <Panel>
        <SectionTitle hint="never in anyone's hands">Center cards</SectionTitle>
        <ul className="grid grid-cols-3 gap-2">
          {result.centerCards.map((role, i) => (
            <li key={i}>
              <RoleCard
                role={role}
                size="sm"
                caption={
                  <span className="mt-0.5 text-[0.65rem] tracking-wide text-mist-400 uppercase">
                    Center {i + 1}
                    {result.originalCenterCards[i] !== role ? ' · swapped in' : ''}
                  </span>
                }
              />
            </li>
          ))}
        </ul>
      </Panel>

      {/* Night log */}
      {result.nightLog.length > 0 && <NightLog result={result} />}

      <div className="space-y-2">
        {isHost ? (
          <Button size="lg" full onClick={playAgain}>
            Back to the lobby
          </Button>
        ) : (
          <Panel className="text-center text-sm text-mist-300">
            Waiting for the host to start another round.
          </Panel>
        )}
        <Button variant="ghost" full onClick={leaveRoom}>
          Leave table
        </Button>
      </div>
    </div>
  );
}

function PlayerResultRow({
  player,
  result,
  isMe,
  nameOf,
}: {
  player: PublicPlayer;
  result: GameResult;
  isMe: boolean;
  nameOf: (id: string) => string;
}) {
  const finalRole = result.finalRoles[player.id];
  const dealtRole = result.originalRoles[player.id];
  if (!finalRole) return null;

  const changed = finalRole !== dealtRole;
  const killed = result.killedIds.includes(player.id);
  const won = result.winnerIds.includes(player.id);
  const votedFor = result.votes.find((v) => v.voterId === player.id)?.targetId;
  const votesReceived = result.voteCounts[player.id] ?? 0;

  return (
    <li
      className={cx(
        'rounded-xl border p-3',
        won ? 'border-moss-500/50 bg-moss-500/10' : 'border-night-700/60 bg-night-900/50',
        isMe && 'ring-1 ring-moon-300/40'
      )}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none" aria-hidden>
          {ROLES[finalRole].glyph}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-medium text-moon-100">{player.name}</span>
            {isMe && <Pill tone="neutral">you</Pill>}
            {player.isBot && <Pill tone="mist">bot</Pill>}
            {killed && <Pill tone="blood">killed</Pill>}
            {won && <Pill tone="moss">winner</Pill>}
          </div>

          <p className="mt-1 text-sm text-mist-200">
            Ended as the{' '}
            <span className="font-medium text-moon-100">{ROLES[finalRole].name}</span>
          </p>

          {changed && (
            <p className="mt-0.5 text-xs text-moon-300">
              Dealt the {ROLES[dealtRole].name} — their card was moved during the night.
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <TeamBadge team={ROLES[finalRole].team} />
            {votedFor && <Pill tone="mist">voted {nameOf(votedFor)}</Pill>}
            <Pill tone="neutral">
              {votesReceived} vote{votesReceived === 1 ? '' : 's'} received
            </Pill>
          </div>
        </div>
      </div>
    </li>
  );
}

function NightLog({ result }: { result: GameResult }) {
  const [open, setOpen] = useState(false);

  return (
    <Panel>
      <SectionTitle
        hint={
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="text-xs text-moon-300 underline-offset-2 active:underline"
          >
            {open ? 'Hide' : 'Show'}
          </button>
        }
      >
        What happened in the night
      </SectionTitle>

      {open ? (
        <ol className="space-y-2">
          {result.nightLog.map((entry, i) => (
            <li
              key={i}
              className="flex items-start gap-3 rounded-xl border border-night-700/60 bg-night-900/50 p-3"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-moon-300/15 font-display text-xs text-moon-200">
                {entry.stepIndex + 1}
              </span>
              <div className="min-w-0">
                <p className="text-xs tracking-[0.14em] text-moon-300 uppercase">
                  {ROLES[entry.role].name}
                </p>
                <p className="mt-0.5 text-sm leading-snug text-mist-200">{entry.text}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-mist-400">
          The full swap chain, step by step — useful for checking how a card ended up where it did.
        </p>
      )}
    </Panel>
  );
}
