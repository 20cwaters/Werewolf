import { useEffect, useMemo, useState } from 'react';
import { ROLES, type NightAction, type NightTurn, type PublicPlayer } from '@onuw/shared';
import { useGame } from '../lib/useGame';
import { useCountdown } from '../lib/useCountdown';
import { Button, CardBack, Modal, Panel, Pill, RoleCard, TimerBar, cx } from '../components/ui';

export function NightPhase() {
  const { state } = useGame();
  const room = state.room;
  if (!room?.night) return null;

  return (
    <div className="safe-x safe-bottom mx-auto flex min-h-full w-full max-w-md flex-col px-4 pb-6">
      <div className="pt-2">
        <NightHeader />
      </div>
      <div className="flex flex-1 flex-col justify-center py-4">
        {state.turn ? <TurnPanel turn={state.turn} /> : <WaitingPanel />}
      </div>
      <ResultModal />
    </div>
  );
}

function NightHeader() {
  const { state } = useGame();
  const night = state.room?.night;
  const { seconds, fraction } = useCountdown(night?.endsAt ?? null);
  if (!night) return null;

  const roleName = night.roleId ? ROLES[night.roleId].name : null;

  return (
    <div className="space-y-2">
      <TimerBar
        fraction={fraction}
        urgent={seconds <= 5}
        label={
          <>
            <span>
              Night step {night.stepIndex + 1} of {night.totalSteps}
            </span>
            <span className="font-display tabular-nums">{seconds}s</span>
          </>
        }
      />
      <p className="text-center font-display text-lg text-moon-200">
        {roleName ? (
          <>
            <span aria-hidden className="mr-1">
              {ROLES[night.roleId!].glyph}
            </span>
            The {roleName} is awake
          </>
        ) : (
          'Someone is awake'
        )}
      </p>
    </div>
  );
}

/**
 * What everyone who is not acting sees. Deliberately says nothing about who is
 * awake — only which numbered step the night has reached.
 */
function WaitingPanel() {
  const { state } = useGame();
  const dots = useSpinnerDots();

  return (
    <Panel className="flex flex-col items-center gap-4 py-10 text-center">
      <div className="relative">
        <div className="size-20 animate-moon-glow rounded-full bg-gradient-to-br from-moon-200 to-moon-400" />
        <div className="absolute inset-0 translate-x-3 rounded-full bg-night-950" />
      </div>
      <div>
        <p className="font-display text-xl text-moon-100">Eyes closed{dots}</p>
        <p className="mx-auto mt-2 max-w-[16rem] text-sm leading-relaxed text-mist-300">
          Someone is taking their turn. You will be told if it is yours.
        </p>
      </div>
      {state.knownRole && (
        <Pill tone="mist">
          <span aria-hidden>{ROLES[state.knownRole].glyph}</span> You are the{' '}
          {ROLES[state.knownRole].name}
        </Pill>
      )}
    </Panel>
  );
}

function useSpinnerDots() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setN((v) => (v + 1) % 4), 600);
    return () => window.clearInterval(id);
  }, []);
  return '.'.repeat(n);
}

// ---------------------------------------------------------------------------
// The acting player's private panel
// ---------------------------------------------------------------------------

function TurnPanel({ turn }: { turn: NightTurn }) {
  const { state, submitAction, players } = useGame();
  const def = ROLES[turn.role];
  const [sent, setSent] = useState(false);

  // A fresh step must clear the "sent" latch.
  useEffect(() => setSent(false), [turn.stepIndex]);

  const send = (action: NightAction) => {
    if (sent) return;
    setSent(true);
    submitAction(action);
  };

  const targets = useMemo(
    () => players.filter((p) => turn.targetablePlayerIds.includes(p.id)),
    [players, turn.targetablePlayerIds]
  );

  return (
    <div className="animate-rise space-y-4">
      <Panel className="border-moon-300/40 bg-moon-300/5">
        <div className="flex items-start gap-3">
          <span className="text-3xl leading-none" aria-hidden>
            {def.glyph}
          </span>
          <div className="min-w-0">
            <p className="text-xs tracking-[0.18em] text-moon-300 uppercase">Your turn</p>
            <h2 className="font-display text-xl text-moon-100">{turn.headline}</h2>
            <p className="mt-1 text-sm leading-relaxed text-mist-200">{turn.instruction}</p>
          </div>
        </div>

        {turn.peers.length > 0 && (
          <div className="mt-3 rounded-xl border border-blood-500/40 bg-blood-500/10 p-3">
            <p className="text-xs tracking-[0.14em] text-blood-400 uppercase">{turn.peersLabel}</p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {turn.peers.map((peer) => (
                <li key={peer.id}>
                  <Pill tone="blood">{peer.name}</Pill>
                </li>
              ))}
            </ul>
          </div>
        )}

        {state.tutorial && (
          <div className="mt-3 rounded-xl border border-moon-300/30 bg-night-950/50 p-3">
            <p className="text-xs tracking-[0.14em] text-moon-300 uppercase">Tutorial</p>
            <p className="mt-1 text-sm leading-snug text-mist-200">{def.tutorial}</p>
          </div>
        )}
      </Panel>

      {sent ? (
        <Panel className="text-center text-sm text-mist-300">Locking in your choice…</Panel>
      ) : (
        <ChoicePanel turn={turn} targets={targets} onSubmit={send} />
      )}
    </div>
  );
}

function ChoicePanel({
  turn,
  targets,
  onSubmit,
}: {
  turn: NightTurn;
  targets: PublicPlayer[];
  onSubmit: (action: NightAction) => void;
}) {
  switch (turn.choiceKind) {
    case 'none':
      return (
        <Button size="lg" full onClick={() => onSubmit({ type: 'acknowledge' })}>
          Got it — back to sleep
        </Button>
      );
    case 'werewolf_lone_center':
      return <CenterChoice count={1} mandatory={false} onSubmit={onSubmit} verb="Peek at" />;
    case 'drunk':
      return <CenterChoice count={1} mandatory onSubmit={onSubmit} verb="Swap with" />;
    case 'seer':
      return <SeerChoice targets={targets} onSubmit={onSubmit} />;
    case 'robber':
      return <RobberChoice targets={targets} onSubmit={onSubmit} />;
    case 'troublemaker':
      return <TroublemakerChoice targets={targets} onSubmit={onSubmit} />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Selection widgets
// ---------------------------------------------------------------------------

function PlayerPicker({
  targets,
  selected,
  onToggle,
  max,
}: {
  targets: PublicPlayer[];
  selected: string[];
  onToggle: (id: string) => void;
  max: number;
}) {
  return (
    <ul className="grid grid-cols-2 gap-2">
      {targets.map((player) => {
        const isSelected = selected.includes(player.id);
        const atLimit = selected.length >= max && !isSelected;
        return (
          <li key={player.id}>
            <button
              type="button"
              onClick={() => onToggle(player.id)}
              disabled={atLimit}
              aria-pressed={isSelected}
              className={cx(
                'flex min-h-16 w-full flex-col items-center justify-center gap-0.5 rounded-xl border px-2 py-3 transition-colors',
                isSelected
                  ? 'border-moon-300 bg-moon-300/20 text-moon-100'
                  : 'border-night-600/70 bg-night-900/60 text-mist-200 active:bg-night-800',
                atLimit && 'opacity-40'
              )}
            >
              <span className="max-w-full truncate font-medium">{player.name}</span>
              <span className="text-xs text-mist-400">
                Seat {player.seat + 1}
                {player.isBot ? ' · bot' : ''}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function CenterPicker({
  selected,
  onToggle,
  max,
}: {
  selected: number[];
  onToggle: (index: number) => void;
  max: number;
}) {
  return (
    <ul className="grid grid-cols-3 gap-2">
      {[0, 1, 2].map((index) => {
        const isSelected = selected.includes(index);
        const atLimit = selected.length >= max && !isSelected;
        return (
          <li key={index}>
            <button
              type="button"
              onClick={() => onToggle(index)}
              disabled={atLimit}
              aria-pressed={isSelected}
              aria-label={`Center card ${index + 1}`}
              className={cx(
                'flex w-full flex-col items-center gap-1.5 rounded-xl border p-2 transition-colors',
                isSelected
                  ? 'border-moon-300 bg-moon-300/20'
                  : 'border-night-600/70 bg-night-900/60 active:bg-night-800',
                atLimit && 'opacity-40'
              )}
            >
              <span className="block aspect-[3/4] w-full">
                <CardBack />
              </span>
              <span
                className={cx(
                  'text-xs font-medium',
                  isSelected ? 'text-moon-200' : 'text-mist-300'
                )}
              >
                Center {index + 1}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function CenterChoice({
  count,
  mandatory,
  onSubmit,
  verb,
}: {
  count: number;
  mandatory: boolean;
  onSubmit: (action: NightAction) => void;
  verb: string;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const toggle = (index: number) =>
    setSelected((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index].slice(-count)
    );

  const ready = selected.length === count;

  return (
    <div className="space-y-3">
      <CenterPicker selected={selected} onToggle={toggle} max={count} />
      <Button
        size="lg"
        full
        disabled={!ready}
        onClick={() =>
          onSubmit(
            mandatory
              ? { type: 'drunk_swap', center: selected[0] }
              : { type: 'werewolf_center', center: selected[0] }
          )
        }
      >
        {ready ? `${verb} center ${selected[0] + 1}` : `Choose a center card to ${verb.toLowerCase()}`}
      </Button>
      {!mandatory && (
        <Button variant="ghost" full onClick={() => onSubmit({ type: 'skip' })}>
          Look at nothing
        </Button>
      )}
      {mandatory && (
        <p className="text-center text-xs text-moon-300">
          This swap is required — the Drunk always trades a card.
        </p>
      )}
    </div>
  );
}

function SeerChoice({
  targets,
  onSubmit,
}: {
  targets: PublicPlayer[];
  onSubmit: (action: NightAction) => void;
}) {
  const [mode, setMode] = useState<'player' | 'center'>('player');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [centers, setCenters] = useState<number[]>([]);

  const ready = mode === 'player' ? !!playerId : centers.length === 2;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-night-900/80 p-1">
        {(
          [
            ['player', "One player's card"],
            ['center', 'Two center cards'],
          ] as ['player' | 'center', string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={mode === id}
            onClick={() => setMode(id)}
            className={cx(
              'min-h-12 rounded-lg px-2 text-sm font-medium transition-colors',
              mode === id ? 'bg-moon-300 text-night-950' : 'text-mist-300 active:bg-night-800'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'player' ? (
        <PlayerPicker
          targets={targets}
          selected={playerId ? [playerId] : []}
          onToggle={(id) => setPlayerId((prev) => (prev === id ? null : id))}
          max={1}
        />
      ) : (
        <>
          <CenterPicker
            selected={centers}
            onToggle={(index) =>
              setCenters((prev) =>
                prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index].slice(-2)
              )
            }
            max={2}
          />
          <p className="text-center text-xs text-mist-400">
            Pick exactly two. {2 - centers.length} to go.
          </p>
        </>
      )}

      <Button
        size="lg"
        full
        disabled={!ready}
        onClick={() =>
          onSubmit(
            mode === 'player'
              ? { type: 'seer_player', targetId: playerId as string }
              : { type: 'seer_center', centers }
          )
        }
      >
        Look
      </Button>
      <Button variant="ghost" full onClick={() => onSubmit({ type: 'skip' })}>
        Look at nothing
      </Button>
    </div>
  );
}

function RobberChoice({
  targets,
  onSubmit,
}: {
  targets: PublicPlayer[];
  onSubmit: (action: NightAction) => void;
}) {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const target = targets.find((p) => p.id === playerId);

  return (
    <div className="space-y-3">
      <PlayerPicker
        targets={targets}
        selected={playerId ? [playerId] : []}
        onToggle={(id) => setPlayerId((prev) => (prev === id ? null : id))}
        max={1}
      />
      <Button
        size="lg"
        full
        disabled={!playerId}
        onClick={() => onSubmit({ type: 'robber_rob', targetId: playerId as string })}
      >
        {target ? `Rob ${target.name}` : 'Choose someone to rob'}
      </Button>
      <Button variant="ghost" full onClick={() => onSubmit({ type: 'skip' })}>
        Rob nobody — stay the Robber
      </Button>
    </div>
  );
}

function TroublemakerChoice({
  targets,
  onSubmit,
}: {
  targets: PublicPlayer[];
  onSubmit: (action: NightAction) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-2)
    );

  const names = selected
    .map((id) => targets.find((p) => p.id === id)?.name)
    .filter(Boolean) as string[];

  return (
    <div className="space-y-3">
      <PlayerPicker targets={targets} selected={selected} onToggle={toggle} max={2} />
      <p className="text-center text-xs text-mist-400">
        {selected.length === 2
          ? `Swapping ${names[0]} and ${names[1]}.`
          : `Pick two players. ${2 - selected.length} to go.`}
      </p>
      <Button
        size="lg"
        full
        disabled={selected.length !== 2}
        onClick={() => onSubmit({ type: 'troublemaker_swap', targetIds: selected })}
      >
        Swap their cards
      </Button>
      <Button variant="ghost" full onClick={() => onSubmit({ type: 'skip' })}>
        Swap nobody
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result of your own action
// ---------------------------------------------------------------------------

function ResultModal() {
  const { state, dismissResult } = useGame();
  const result = state.actionResult;
  if (!result) return null;

  return (
    <Modal
      open
      onClose={dismissResult}
      title={`${ROLES[result.role].name} — what you learned`}
      labelledBy="night-result-title"
      footer={
        <Button full onClick={dismissResult}>
          Memorised it
        </Button>
      }
    >
      <p className="text-base leading-relaxed text-moon-100">{result.message}</p>

      {result.revealed.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-3">
          {result.revealed.map((card, i) => (
            <li key={i}>
              <RoleCard
                role={card.role}
                caption={
                  <span className="mt-1 text-xs tracking-wide text-moon-300 uppercase">
                    {card.label}
                  </span>
                }
              />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs leading-relaxed text-mist-400">
        Only you saw this. It stays in your night notes — tap the notes button any time to check it
        again.
      </p>
    </Modal>
  );
}
