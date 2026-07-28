import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { ROLES, TEAM_LABEL, type RoleId, type Team } from '@onuw/shared';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Button — every variant is at least 48px tall for comfortable thumbs.
// ---------------------------------------------------------------------------

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'lg' | 'sm';
  full?: boolean;
};

const VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-moon-300 text-night-950 font-semibold shadow-lg shadow-moon-300/10 active:bg-moon-400 disabled:bg-night-700 disabled:text-mist-400',
  secondary:
    'bg-night-700/80 text-moon-100 border border-night-500/70 active:bg-night-600 disabled:text-mist-500',
  ghost: 'bg-transparent text-mist-200 border border-night-600/70 active:bg-night-800',
  danger:
    'bg-blood-500 text-moon-50 font-semibold active:bg-blood-600 disabled:bg-night-700 disabled:text-mist-400',
};

const SIZES: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'min-h-10 px-3 text-sm rounded-lg',
  md: 'min-h-12 px-4 text-base rounded-xl',
  lg: 'min-h-14 px-5 text-lg rounded-2xl',
};

export function Button({
  variant = 'primary',
  size = 'md',
  full,
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-2 transition-colors select-none',
        'disabled:cursor-not-allowed disabled:opacity-70',
        VARIANTS[variant],
        SIZES[size],
        full && 'w-full',
        className
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

export function Panel({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article';
}) {
  return <Tag className={cx('panel p-4', className)}>{children}</Tag>;
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h2 className="font-display text-sm tracking-[0.18em] text-moon-300 uppercase">{children}</h2>
      {hint ? <span className="text-xs text-mist-400">{hint}</span> : null}
    </div>
  );
}

export function Pill({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'moon' | 'blood' | 'moss' | 'mist';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-night-700/70 text-mist-200 border-night-500/60',
    moon: 'bg-moon-300/15 text-moon-200 border-moon-300/40',
    blood: 'bg-blood-500/20 text-blood-400 border-blood-500/50',
    moss: 'bg-moss-500/20 text-moss-400 border-moss-500/50',
    mist: 'bg-night-800/70 text-mist-300 border-night-600/60',
  };
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium',
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Modal — used for rules, journal, role results and tutorial prompts.
// ---------------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  labelledBy = 'modal-title',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  labelledBy?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Stop the page behind the sheet from scrolling on touch devices.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-night-950/80 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={cx(
          'panel animate-rise relative flex max-h-[88vh] w-full flex-col sm:max-w-lg',
          'safe-bottom rounded-b-none sm:rounded-b-2xl'
        )}
      >
        <div className="hairline flex items-center justify-between gap-3 border-b px-4 py-3">
          <h2 id={labelledBy} className="font-display text-lg text-moon-100">
            {title}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close dialog">
            Close
          </Button>
        </div>
        <div className="scroll-dark flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {children}
        </div>
        {footer ? <div className="hairline border-t px-4 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Role presentation
// ---------------------------------------------------------------------------

const TEAM_TONE: Record<Team, 'blood' | 'moss' | 'moon'> = {
  werewolf: 'blood',
  village: 'moss',
  tanner: 'moon',
};

export function TeamBadge({ team }: { team: Team }) {
  return (
    <Pill tone={TEAM_TONE[team]}>
      {team === 'werewolf' ? '🐺' : team === 'tanner' ? '🪓' : '🏡'} {TEAM_LABEL[team]}
    </Pill>
  );
}

/** A role card face. `size="sm"` is the chip used in lists and results. */
export function RoleCard({
  role,
  size = 'md',
  caption,
  className,
}: {
  role: RoleId;
  size?: 'sm' | 'md' | 'lg';
  caption?: ReactNode;
  className?: string;
}) {
  const def = ROLES[role];
  const glyphSize = size === 'lg' ? 'text-6xl' : size === 'md' ? 'text-4xl' : 'text-2xl';
  const nameSize = size === 'lg' ? 'text-2xl' : size === 'md' ? 'text-lg' : 'text-sm';

  return (
    <div
      className={cx(
        'flex flex-col items-center justify-center gap-1 rounded-xl border text-center',
        'border-moon-300/25 bg-gradient-to-b from-night-700/90 to-night-900/95',
        size === 'lg' ? 'p-6' : size === 'md' ? 'p-4' : 'px-2 py-2',
        className
      )}
    >
      <span className={glyphSize} aria-hidden>
        {def.glyph}
      </span>
      <span className={cx('font-display text-moon-100', nameSize)}>{def.name}</span>
      {size !== 'sm' && (
        <span className="mt-1 text-xs leading-snug text-mist-300">{def.blurb}</span>
      )}
      {caption}
    </div>
  );
}

/** The card back: what everyone else sees. */
export function CardBack({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        'flex h-full w-full items-center justify-center rounded-xl border border-moon-300/20',
        'bg-gradient-to-br from-night-800 via-night-900 to-night-950',
        className
      )}
    >
      <svg viewBox="0 0 100 100" className="h-2/3 w-2/3 opacity-70" aria-hidden>
        <defs>
          <radialGradient id="backMoon" cx="40%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#f0e6c8" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#dcc07c" stopOpacity="0.3" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="42" r="20" fill="url(#backMoon)" />
        <circle cx="60" cy="36" r="17" fill="#0b1224" />
        <path
          d="M18 82 Q34 60 50 74 Q66 60 82 82 Z"
          fill="none"
          stroke="#dcc07c"
          strokeOpacity="0.45"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timer bar
// ---------------------------------------------------------------------------

export function TimerBar({
  fraction,
  label,
  urgent,
}: {
  fraction: number;
  label: ReactNode;
  urgent?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs text-mist-300">{label}</div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-night-800"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fraction * 100)}
      >
        <div
          className={cx(
            'h-full rounded-full transition-[width] duration-200 ease-linear',
            urgent ? 'bg-blood-500' : 'bg-moon-300'
          )}
          style={{ width: `${Math.max(0, Math.min(100, fraction * 100))}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toast — transient errors and notices
// ---------------------------------------------------------------------------

export function Toast({
  message,
  onDismiss,
  tone = 'blood',
}: {
  message: string;
  onDismiss: () => void;
  tone?: 'blood' | 'moon';
}) {
  useEffect(() => {
    const id = window.setTimeout(onDismiss, 5000);
    return () => window.clearTimeout(id);
  }, [message, onDismiss]);

  return (
    <div className="safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-60 flex justify-center px-3 pb-3">
      <div
        role="status"
        aria-live="polite"
        className={cx(
          'animate-rise pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border p-3 shadow-2xl',
          tone === 'blood'
            ? 'border-blood-500/60 bg-blood-600/95 text-moon-50'
            : 'border-moon-300/50 bg-night-800/95 text-moon-100'
        )}
      >
        <span className="flex-1 text-sm leading-snug">{message}</span>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg px-2 py-1 text-xs font-semibold underline-offset-2 active:underline"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
