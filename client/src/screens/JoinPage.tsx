import { useState } from 'react';
import { TIMER_LIMITS, defaultConfig, type RoomConfig } from '@onuw/shared';
import { useGame } from '../lib/useGame';
import { MoonCrest } from '../components/Backdrop';
import { DeckEditor, type RoleCounts } from '../components/DeckEditor';
import { RulesButton, RulesReference } from '../components/RulesReference';
import { Button, Panel, Pill, cx } from '../components/ui';

type Tab = 'join' | 'create';

/** Sensible starting point: a 4-seat table the host can grow with bots. */
const DEFAULT_TABLE = 4;

export function JoinPage() {
  const { state, joinRoom, createRoom, setJoinCode } = useGame();
  const [tab, setTab] = useState<Tab>(state.joinCode ? 'join' : 'create');
  const [name, setName] = useState(state.savedName);
  const [tutorial, setTutorial] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [config, setConfig] = useState<RoomConfig>(() => defaultConfig(DEFAULT_TABLE));

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && state.connected;
  const codeReady = state.joinCode.trim().length === 4;

  const submit = () => {
    if (!canSubmit) return;
    if (tab === 'join') {
      if (!codeReady) return;
      joinRoom(state.joinCode.trim().toUpperCase(), trimmedName, tutorial);
    } else {
      createRoom(trimmedName, config, tutorial);
    }
  };

  return (
    <div className="safe-x safe-top safe-bottom mx-auto flex min-h-full w-full max-w-md flex-col px-4">
      <header className="flex items-center justify-end pt-1">
        <RulesButton onClick={() => setRulesOpen(true)} />
      </header>

      <div className="flex flex-col items-center pt-2 pb-5 text-center">
        <MoonCrest className="h-32 w-32 sm:h-36 sm:w-36" />
        <h1 className="font-display mt-3 text-3xl leading-tight text-moon-100">
          One Night
          <span className="mt-0.5 block text-xl tracking-[0.28em] text-moon-300 uppercase">
            Ultimate Werewolf
          </span>
        </h1>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-mist-300">
          One night. One vote. No second chances. Gather 3 to 10 players — or fill the table with
          bots.
        </p>
      </div>

      <Panel className="flex-1">
        {/* Tabs */}
        <div
          role="tablist"
          aria-label="Join or create a game"
          className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-night-900/80 p-1"
        >
          {(
            [
              ['join', 'Join game'],
              ['create', 'Create game'],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cx(
                'min-h-12 rounded-lg px-3 text-sm font-semibold transition-colors',
                tab === id ? 'bg-moon-300 text-night-950' : 'text-mist-300 active:bg-night-800'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="name" className="mb-1.5 block text-xs tracking-wide text-mist-300 uppercase">
              Your name
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={16}
              autoComplete="nickname"
              enterKeyHint={tab === 'join' ? 'go' : 'next'}
              placeholder="e.g. Casey"
              className="min-h-14 w-full rounded-xl border border-night-600 bg-night-950/70 px-4 text-lg text-moon-100 placeholder:text-mist-500 focus:border-moon-300 focus:outline-none"
            />
          </div>

          {tab === 'join' ? (
            <div>
              <label
                htmlFor="code"
                className="mb-1.5 block text-xs tracking-wide text-mist-300 uppercase"
              >
                Room code
              </label>
              <input
                id="code"
                value={state.joinCode}
                onChange={(e) =>
                  setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))
                }
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="go"
                placeholder="ABCD"
                className="min-h-16 w-full rounded-xl border border-night-600 bg-night-950/70 px-4 text-center font-display text-3xl tracking-[0.4em] text-moon-100 placeholder:tracking-[0.4em] placeholder:text-mist-500 focus:border-moon-300 focus:outline-none"
              />
              <p className="mt-2 text-xs text-mist-400">
                Ask the host for their 4-character code, or open the link they shared.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="discussion"
                  className="mb-1.5 flex items-baseline justify-between text-xs tracking-wide text-mist-300 uppercase"
                >
                  <span>Discussion timer</span>
                  <span className="font-display text-sm tracking-normal text-moon-200 normal-case">
                    {Math.floor(config.discussionSeconds / 60)}m
                    {config.discussionSeconds % 60 ? ` ${config.discussionSeconds % 60}s` : ''}
                  </span>
                </label>
                <input
                  id="discussion"
                  type="range"
                  min={TIMER_LIMITS.discussionSeconds.min}
                  max={TIMER_LIMITS.discussionSeconds.max}
                  step={30}
                  value={config.discussionSeconds}
                  onChange={(e) =>
                    setConfig({ ...config, discussionSeconds: Number(e.target.value) })
                  }
                  className="h-11 w-full accent-[color:var(--color-moon-300)]"
                />
              </div>

              <ToggleRow
                label="Announce the waking role"
                hint="On: everyone sees “the Seer is awake”. Off: only “night step 3 of 7”. Either way, who holds the role stays secret."
                checked={config.announceNightRoles}
                onChange={(v) => setConfig({ ...config, announceNightRoles: v })}
              />

              <button
                type="button"
                onClick={() => setAdvanced((v) => !v)}
                className="flex min-h-11 w-full items-center justify-between rounded-xl border border-night-600/70 px-3 text-sm text-mist-200"
                aria-expanded={advanced}
              >
                <span>Deck &amp; round timers</span>
                <span aria-hidden className="text-mist-400">
                  {advanced ? '▲' : '▼'}
                </span>
              </button>

              {advanced && (
                <div className="space-y-4 rounded-xl border border-night-700/70 bg-night-950/40 p-3">
                  <p className="text-xs leading-relaxed text-mist-400">
                    Set up for a {DEFAULT_TABLE}-player table for now. The deck resizes itself as
                    people and bots join, and you can fine-tune it in the lobby before starting.
                  </p>
                  <DeckEditor
                    counts={config.roleCounts as RoleCounts}
                    playerCount={DEFAULT_TABLE}
                    onChange={(roleCounts) => setConfig({ ...config, roleCounts })}
                  />
                  <NumberRow
                    label="Night action limit"
                    suffix="s"
                    value={config.nightActionSeconds}
                    min={TIMER_LIMITS.nightActionSeconds.min}
                    max={TIMER_LIMITS.nightActionSeconds.max}
                    step={5}
                    onChange={(nightActionSeconds) => setConfig({ ...config, nightActionSeconds })}
                  />
                  <NumberRow
                    label="Voting time"
                    suffix="s"
                    value={config.voteSeconds}
                    min={TIMER_LIMITS.voteSeconds.min}
                    max={TIMER_LIMITS.voteSeconds.max}
                    step={5}
                    onChange={(voteSeconds) => setConfig({ ...config, voteSeconds })}
                  />
                  <NumberRow
                    label="Role reveal time"
                    suffix="s"
                    value={config.revealSeconds}
                    min={TIMER_LIMITS.revealSeconds.min}
                    max={TIMER_LIMITS.revealSeconds.max}
                    step={5}
                    onChange={(revealSeconds) => setConfig({ ...config, revealSeconds })}
                  />
                </div>
              )}
            </div>
          )}

          <ToggleRow
            label="Tutorial mode"
            hint="Walks you through your role, the night phase, voting and how the win is decided."
            checked={tutorial}
            onChange={setTutorial}
          />

          <Button
            type="submit"
            size="lg"
            full
            disabled={!canSubmit || (tab === 'join' && !codeReady)}
          >
            {tab === 'join' ? 'Join the table' : 'Create the table'}
          </Button>

          {!state.connected && (
            <p className="text-center text-xs text-blood-400">
              Reconnecting to the server…
            </p>
          )}
        </form>
      </Panel>

      <footer className="pt-4 pb-2 text-center text-xs text-mist-500">
        Roles in play: Werewolf, Minion, Mason, Seer, Robber, Troublemaker, Drunk, Insomniac, Tanner,
        Hunter, Villager.
      </footer>

      <RulesReference open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cx(
        'flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors',
        checked ? 'border-moon-300/50 bg-moon-300/10' : 'border-night-600/70 bg-night-950/40'
      )}
    >
      <span
        aria-hidden
        className={cx(
          'mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors',
          checked ? 'bg-moon-300' : 'bg-night-600'
        )}
      >
        <span
          className={cx(
            'h-5 w-5 rounded-full bg-night-950 transition-transform',
            checked && 'translate-x-5'
          )}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-moon-100">{label}</span>
        {hint && <span className="mt-0.5 block text-xs leading-snug text-mist-400">{hint}</span>}
      </span>
    </button>
  );
}

function NumberRow({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-mist-200">{label}</span>
      <div className="flex items-center gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          className="!min-h-11 !w-11 !px-0 text-lg"
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - step))}
          aria-label={`Decrease ${label}`}
        >
          −
        </Button>
        <Pill tone="moon" className="min-w-16 justify-center tabular-nums">
          {value}
          {suffix}
        </Pill>
        <Button
          variant="secondary"
          size="sm"
          className="!min-h-11 !w-11 !px-0 text-lg"
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + step))}
          aria-label={`Increase ${label}`}
        >
          +
        </Button>
      </div>
    </div>
  );
}
