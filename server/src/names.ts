import { pick, type Rng, defaultRng } from '@onuw/shared';

const BOT_NAMES = [
  'Luna',
  'Fang',
  'Ash',
  'Nox',
  'Vesper',
  'Cinder',
  'Bram',
  'Hollow',
  'Ember',
  'Grim',
  'Sable',
  'Wren',
  'Thorn',
  'Mercy',
  'Rook',
];

/** A themed bot name that is not already at the table. */
export function nextBotName(taken: readonly string[], rng: Rng = defaultRng): string {
  const used = new Set(taken.map((n) => n.toLowerCase()));
  const free = BOT_NAMES.filter((n) => !used.has(n.toLowerCase()));
  if (free.length > 0) return pick(free, rng);
  for (let i = 2; ; i++) {
    const candidate = `${BOT_NAMES[0]} ${i}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1

export function makeRoomCode(rng: Rng = defaultRng): string {
  let out = '';
  for (let i = 0; i < 4; i++) out += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  return out;
}

// Control characters plus zero-width and bidi overrides. Without stripping
// these, a player could pick a name that renders identically to someone else's.
// Built from escapes so the source stays pure ASCII.
const INVISIBLE = new RegExp(
  '[\\u0000-\\u001F\\u007F\\u200B-\\u200F\\u202A-\\u202E\\u2060\\uFEFF]',
  'g'
);

/** Trim, collapse whitespace, drop invisible characters, cap length. */
export function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(INVISIBLE, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return cleaned.length >= 1 ? cleaned : null;
}

export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4);
  return cleaned.length === 4 ? cleaned : null;
}
