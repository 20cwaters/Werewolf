import { useState } from 'react';
import { useGame } from './lib/useGame';
import { Backdrop } from './components/Backdrop';
import { Journal, JournalButton } from './components/Journal';
import { RulesButton, RulesReference } from './components/RulesReference';
import { Button, Panel, Pill, Toast, cx } from './components/ui';
import { JoinPage } from './screens/JoinPage';
import { Lobby } from './screens/Lobby';
import { RoleReveal } from './screens/RoleReveal';
import { NightPhase } from './screens/NightPhase';
import { DayPhase } from './screens/DayPhase';
import { VotingPhase } from './screens/VotingPhase';
import { Results } from './screens/Results';

export default function App() {
  const { state, dismissError } = useGame();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);

  const inRoom = !!state.room && !!state.session;

  return (
    <div className="relative flex min-h-full flex-col">
      <Backdrop />

      {state.restoring && !inRoom ? (
        <Splash />
      ) : !inRoom ? (
        <JoinPage />
      ) : (
        <>
          <TopBar
            onOpenRules={() => setRulesOpen(true)}
            onOpenJournal={() => setJournalOpen(true)}
          />
          <main className="flex flex-1 flex-col">
            <PhaseScreen />
          </main>
          <Journal open={journalOpen} onClose={() => setJournalOpen(false)} />
        </>
      )}

      <RulesReference
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        deck={state.room?.deck ?? null}
      />

      {state.error && <Toast message={state.error.message} onDismiss={dismissError} />}

      {!state.connected && !state.restoring && <ReconnectBanner />}
    </div>
  );
}

function PhaseScreen() {
  const { state } = useGame();
  switch (state.room?.phase) {
    case 'lobby':
      return <Lobby />;
    case 'reveal':
      return <RoleReveal />;
    case 'night':
      return <NightPhase />;
    case 'day':
      return <DayPhase />;
    case 'voting':
      return <VotingPhase />;
    case 'results':
      return <Results />;
    default:
      return null;
  }
}

function TopBar({
  onOpenRules,
  onOpenJournal,
}: {
  onOpenRules: () => void;
  onOpenJournal: () => void;
}) {
  const { state, setTutorial } = useGame();
  const room = state.room;
  if (!room) return null;

  const showJournal = room.phase !== 'lobby';

  const phaseLabel: Record<string, string> = {
    lobby: 'Lobby',
    reveal: 'Role reveal',
    night: 'Night',
    day: 'Discussion',
    voting: 'Voting',
    results: 'Results',
  };

  return (
    <header className="safe-top safe-x sticky top-0 z-30 mx-auto w-full max-w-md px-4">
      <div className="panel flex items-center gap-2 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="font-display truncate text-sm tracking-[0.2em] text-moon-200 uppercase">
            {room.code}
          </p>
          <p className="truncate text-xs text-mist-400">
            {phaseLabel[room.phase] ?? room.phase} · {room.players.length} player
            {room.players.length === 1 ? '' : 's'}
          </p>
        </div>

        {state.tutorial && (
          <button
            type="button"
            onClick={() => setTutorial(false)}
            className="shrink-0"
            aria-label="Turn tutorial mode off"
            title="Turn tutorial mode off"
          >
            <Pill tone="moon">Tutorial on</Pill>
          </button>
        )}

        {showJournal && <JournalButton onClick={onOpenJournal} />}
        <RulesButton onClick={onOpenRules} />
      </div>
    </header>
  );
}

function Splash() {
  return (
    <div className="flex min-h-full items-center justify-center px-4">
      <Panel className="flex flex-col items-center gap-3 py-8 text-center">
        <div className="size-12 animate-moon-glow rounded-full bg-gradient-to-br from-moon-200 to-moon-400" />
        <p className="font-display text-lg text-moon-100">Rejoining the table…</p>
      </Panel>
    </div>
  );
}

function ReconnectBanner() {
  const { state } = useGame();
  return (
    <div
      className={cx(
        'safe-top pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-3',
        'transition-opacity'
      )}
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto mt-1 flex items-center gap-2 rounded-full border border-blood-500/60 bg-blood-600/95 px-3 py-1.5 text-xs text-moon-50 shadow-xl">
        <span className="size-2 animate-pulse rounded-full bg-moon-100" aria-hidden />
        Connection lost — reconnecting
        {state.room ? '. Your seat is held for you.' : '…'}
      </div>
    </div>
  );
}

/** Rendered by the error boundary in main.tsx. */
export function CrashScreen({ onReload }: { onReload: () => void }) {
  return (
    <div className="relative flex min-h-full items-center justify-center px-4">
      <Backdrop />
      <Panel className="max-w-sm text-center">
        <p className="font-display text-xl text-moon-100">The night went wrong</p>
        <p className="mt-2 text-sm leading-relaxed text-mist-300">
          Something broke in the app. Reloading will put you back in your seat if the round is still
          running.
        </p>
        <Button className="mt-4" full onClick={onReload}>
          Reload
        </Button>
      </Panel>
    </div>
  );
}
