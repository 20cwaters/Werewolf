import { useState } from 'react';
import { ROLES, TIMER_LIMITS, validateRoleCounts, type RoleId } from '@onuw/shared';
import { useGame } from '../lib/useGame';
import { DeckEditor, type RoleCounts } from '../components/DeckEditor';
import { Button, Panel, Pill, SectionTitle, cx } from '../components/ui';
import { shareUrlFor } from '../lib/socket';

export function Lobby() {
  const { state, players, isHost, addBot, removeBot, kick, updateConfig, startGame, leaveRoom } =
    useGame();
  const room = state.room;
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [showDeck, setShowDeck] = useState(false);

  if (!room) return null;

  const validation = validateRoleCounts(room.config.roleCounts, players.length);
  const canStart = isHost && players.length >= room.minPlayers && validation.ok;
  const botCount = players.filter((p) => p.isBot).length;

  const copy = async (value: string, which: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      // Clipboard is unavailable over plain http on some mobile browsers; the
      // code is displayed in full so it can still be read out or typed.
      setCopied(null);
    }
  };

  return (
    <div className="safe-x safe-bottom mx-auto w-full max-w-md space-y-4 px-4 pb-6">
      {/* Room code + sharing */}
      <Panel className="text-center">
        <SectionTitle hint={`${players.length} / ${room.maxPlayers} seats`}>Room code</SectionTitle>
        <p className="font-display text-5xl tracking-[0.32em] text-moon-100">{room.code}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => copy(room.code, 'code')}>
            {copied === 'code' ? 'Copied!' : 'Copy code'}
          </Button>
          <Button variant="secondary" onClick={() => copy(shareUrlFor(room.code), 'link')}>
            {copied === 'link' ? 'Copied!' : 'Copy link'}
          </Button>
        </div>
      </Panel>

      {/* Players */}
      <Panel>
        <SectionTitle hint={botCount > 0 ? `${botCount} bot${botCount === 1 ? '' : 's'}` : undefined}>
          At the table
        </SectionTitle>
        <ul className="space-y-1.5">
          {players.map((player) => (
            <li
              key={player.id}
              className={cx(
                'flex items-center gap-3 rounded-xl border p-3',
                player.id === state.session?.playerId
                  ? 'border-moon-300/40 bg-moon-300/5'
                  : 'border-night-700/60 bg-night-900/50'
              )}
            >
              <span
                aria-hidden
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-night-700 font-display text-sm text-moon-200"
              >
                {player.seat + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate font-medium text-moon-100">{player.name}</span>
                  {player.isHost && <Pill tone="moon">host</Pill>}
                  {player.isBot && <Pill tone="mist">bot</Pill>}
                  {player.id === state.session?.playerId && <Pill tone="neutral">you</Pill>}
                  {!player.connected && !player.isBot && <Pill tone="blood">offline</Pill>}
                </div>
              </div>
              {isHost && player.id !== state.session?.playerId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => (player.isBot ? removeBot(player.id) : kick(player.id))}
                  aria-label={`Remove ${player.name}`}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>

        {isHost && (
          <div className="mt-3 grid grid-cols-1 gap-2">
            <Button
              variant="secondary"
              onClick={addBot}
              disabled={players.length >= room.maxPlayers}
            >
              <span aria-hidden>🤖</span> Add a bot
            </Button>
          </div>
        )}

        {players.length < room.minPlayers && (
          <p className="mt-3 text-xs leading-relaxed text-moon-300">
            You need at least {room.minPlayers} players. Add{' '}
            {room.minPlayers - players.length} more — bots count, so you can play solo to learn the
            game.
          </p>
        )}
      </Panel>

      {/* Deck summary / editor */}
      <Panel>
        <SectionTitle
          hint={
            <button
              type="button"
              onClick={() => setShowDeck((v) => !v)}
              className="text-xs text-moon-300 underline-offset-2 active:underline"
              aria-expanded={showDeck}
            >
              {showDeck ? 'Hide' : isHost ? 'Edit' : 'Details'}
            </button>
          }
        >
          Roles in play
        </SectionTitle>

        {!showDeck && <DeckSummary counts={room.config.roleCounts} />}

        {showDeck &&
          (isHost ? (
            <DeckEditor
              counts={room.config.roleCounts as RoleCounts}
              playerCount={players.length}
              onChange={(roleCounts) => updateConfig({ roleCounts })}
            />
          ) : (
            <div>
              <DeckSummary counts={room.config.roleCounts} />
              <p className="mt-3 text-xs text-mist-400">Only the host can change the deck.</p>
            </div>
          ))}

        {!validation.ok && players.length >= room.minPlayers && (
          <ul className="mt-3 space-y-1">
            {validation.errors.map((error) => (
              <li key={error} className="text-xs text-blood-400">
                • {error}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Host settings */}
      {isHost && (
        <Panel>
          <SectionTitle>Round settings</SectionTitle>
          <div className="space-y-3">
            <SliderRow
              label="Discussion"
              value={room.config.discussionSeconds}
              min={TIMER_LIMITS.discussionSeconds.min}
              max={TIMER_LIMITS.discussionSeconds.max}
              step={30}
              format={(v) => `${Math.floor(v / 60)}m${v % 60 ? ` ${v % 60}s` : ''}`}
              onChange={(discussionSeconds) => updateConfig({ discussionSeconds })}
            />
            <SliderRow
              label="Night action limit"
              value={room.config.nightActionSeconds}
              min={TIMER_LIMITS.nightActionSeconds.min}
              max={TIMER_LIMITS.nightActionSeconds.max}
              step={5}
              format={(v) => `${v}s`}
              onChange={(nightActionSeconds) => updateConfig({ nightActionSeconds })}
            />
            <SliderRow
              label="Voting"
              value={room.config.voteSeconds}
              min={TIMER_LIMITS.voteSeconds.min}
              max={TIMER_LIMITS.voteSeconds.max}
              step={5}
              format={(v) => `${v}s`}
              onChange={(voteSeconds) => updateConfig({ voteSeconds })}
            />
            <SliderRow
              label="Role reveal"
              value={room.config.revealSeconds}
              min={TIMER_LIMITS.revealSeconds.min}
              max={TIMER_LIMITS.revealSeconds.max}
              step={5}
              format={(v) => `${v}s`}
              onChange={(revealSeconds) => updateConfig({ revealSeconds })}
            />

            <button
              type="button"
              role="switch"
              aria-checked={room.config.announceNightRoles}
              onClick={() =>
                updateConfig({ announceNightRoles: !room.config.announceNightRoles })
              }
              className={cx(
                'flex w-full items-start gap-3 rounded-xl border p-3 text-left',
                room.config.announceNightRoles
                  ? 'border-moon-300/50 bg-moon-300/10'
                  : 'border-night-600/70 bg-night-950/40'
              )}
            >
              <span
                aria-hidden
                className={cx(
                  'mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors',
                  room.config.announceNightRoles ? 'bg-moon-300' : 'bg-night-600'
                )}
              >
                <span
                  className={cx(
                    'h-5 w-5 rounded-full bg-night-950 transition-transform',
                    room.config.announceNightRoles && 'translate-x-5'
                  )}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-moon-100">
                  Announce the waking role
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-mist-400">
                  {room.config.announceNightRoles
                    ? 'Everyone sees which role is awake — but never who holds it.'
                    : 'Everyone sees only the night step number.'}
                </span>
              </span>
            </button>
          </div>
        </Panel>
      )}

      {/* Start / leave */}
      <div className="space-y-2">
        {isHost ? (
          <Button size="lg" full disabled={!canStart} onClick={startGame}>
            {players.length < room.minPlayers
              ? `Need ${room.minPlayers - players.length} more player${
                  room.minPlayers - players.length === 1 ? '' : 's'
                }`
              : !validation.ok
                ? 'Fix the deck to start'
                : 'Begin the night'}
          </Button>
        ) : (
          <Panel className="text-center text-sm text-mist-300">
            Waiting for{' '}
            <span className="text-moon-200">
              {players.find((p) => p.isHost)?.name ?? 'the host'}
            </span>{' '}
            to start the round.
          </Panel>
        )}
        <Button variant="ghost" full onClick={leaveRoom}>
          Leave table
        </Button>
      </div>
    </div>
  );
}

function DeckSummary({ counts }: { counts: Partial<Record<RoleId, number>> }) {
  const entries = (Object.keys(counts) as RoleId[])
    .filter((role) => (counts[role] ?? 0) > 0)
    .sort((a, b) => (ROLES[a].nightOrder ?? 99) - (ROLES[b].nightOrder ?? 99));

  if (entries.length === 0) {
    return <p className="text-sm text-mist-400">No roles chosen yet.</p>;
  }

  return (
    <ul className="flex flex-wrap gap-1.5">
      {entries.map((role) => (
        <li key={role}>
          <Pill tone="neutral">
            <span aria-hidden>{ROLES[role].glyph}</span>
            {ROLES[role].name}
            {(counts[role] ?? 0) > 1 ? ` ×${counts[role]}` : ''}
          </Pill>
        </li>
      ))}
    </ul>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const id = `slider-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 flex items-baseline justify-between text-sm">
        <span className="text-mist-200">{label}</span>
        <span className="font-display text-moon-200 tabular-nums">{format(value)}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-full accent-[color:var(--color-moon-300)]"
      />
    </div>
  );
}
