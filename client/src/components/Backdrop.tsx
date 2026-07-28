import { useMemo } from 'react';

/**
 * Artwork for the night theme: a huge gold moon low on the horizon, a wolf
 * silhouette prowling a ridge, and spiky conifers framing the edges.
 *
 * All of it is inline SVG, so there are no image requests and it stays crisp at
 * any density. The shapes below were built and rendered offline before landing
 * here — see the notes on each part if you need to adjust proportions.
 */

const INK = '#04070e';

// Sky lives on the container as CSS rather than inside the SVG. A full-bleed
// SVG with preserveAspectRatio="slice" crops brutally on tall phone viewports
// (you end up seeing only the middle of the moon), so the scene SVG is anchored
// to the bottom at its natural aspect ratio and the gradient covers the rest.
const SKY =
  'linear-gradient(163deg, #31737f 0%, #2a5570 24%, #2d3460 50%, #2a1e48 75%, #150d29 100%)';

/**
 * Spiky conifer. Each branch runs OUT and DOWN to its tip, then back IN and UP
 * before the next one — that ordering is what makes the edge read as drooping
 * needles rather than a stack of pagoda shelves.
 */
function pine(cx: number, baseY: number, h: number, w: number, tiers = 5): string {
  const top = baseY - h;
  const step = h / tiers;
  const wAt = (i: number) => w * Math.pow(i / tiers, 0.92);
  const yTip = (i: number) => top + step * i;
  const yIn = (i: number) => yTip(i) - step * 0.42;
  const n = (v: number) => v.toFixed(1);

  const right: string[] = [];
  for (let i = 1; i <= tiers; i++) {
    right.push(`L ${n(cx + wAt(i))} ${n(yTip(i))}`, `L ${n(cx + wAt(i) * 0.3)} ${n(yIn(i))}`);
  }
  // Exact mirror: traversing the left side upward reverses each pair.
  const left: string[] = [];
  for (let i = tiers; i >= 1; i--) {
    left.push(`L ${n(cx - wAt(i) * 0.3)} ${n(yIn(i))}`, `L ${n(cx - wAt(i))} ${n(yTip(i))}`);
  }
  left.reverse();

  const t = Math.max(1.6, w * 0.11);
  return (
    `M ${cx} ${n(top)} ${right.join(' ')} ` +
    `L ${n(cx + t)} ${n(baseY)} L ${n(cx - t)} ${n(baseY)} ${left.join(' ')} Z`
  );
}

/**
 * The wolf, facing left, standing on y = 126 in its own coordinate space
 * (x runs about -6 to 191).
 *
 * Each part is a separate <path> element on purpose. Merging them into one `d`
 * makes the nonzero fill rule cancel wherever two subpaths wind in opposite
 * directions, which punches holes straight through the silhouette. Parts also
 * overlap generously so no sliver gaps open at the joins.
 */
const WOLF_PARTS: string[] = [
  // tail: thick at the base, tapering to a real point up and to the right
  'M 130 50 C 142 42 156 28 168 15 C 176 7 186 2 191 5 C 188 13 180 24 170 35 C 159 46 146 56 138 59 C 131 61 126 55 130 50 Z',
  // far legs first so the near pair reads in front
  'M 58 68 C 49 86 38 106 30 116 L 28 126 L 45 126 L 48 116 C 56 104 68 88 74 70 Z',
  'M 138 60 C 150 72 149 92 142 102 C 136 110 138 119 143 126 L 158 126 C 154 118 157 110 162 100 C 169 88 168 70 161 58 Z',
  // compact torso with a deep chest
  'M 74 48 C 90 42 116 42 130 50 C 140 56 142 68 138 78 C 132 86 116 88 100 88 C 84 88 74 82 70 74 C 64 66 66 53 74 48 Z',
  'M 112 56 C 126 52 140 60 142 73 C 144 86 134 94 122 92 C 110 90 104 79 106 67 C 107 60 109 57 112 56 Z',
  'M 74 52 C 88 50 96 62 95 74 C 94 84 84 90 74 88 C 62 86 58 72 60 62 C 62 55 68 53 74 52 Z',
  // near legs, with a real hock bend on the hind
  'M 108 58 C 122 70 124 90 115 100 C 107 110 105 118 107 126 L 124 126 C 122 118 124 110 132 100 C 142 88 144 70 138 56 Z',
  'M 68 66 C 63 84 65 102 62 116 L 61 126 L 82 126 L 81 112 C 84 96 88 80 87 66 Z',
  // shaggy ruff, heavy over the shoulders and dropping to a low ridge along the
  // spine; a uniform row of tall spikes reads as a stegosaurus instead
  'M 44 56 L 50 26 L 60 46 L 68 22 L 78 44 L 88 26 L 98 46 L 108 38 L 116 48 L 124 42 L 132 50 L 138 60 L 44 68 Z',
  // short thick neck, then the head on top of everything
  'M 50 42 C 62 38 74 42 82 50 C 88 58 88 72 82 79 C 72 85 56 82 48 74 C 42 66 42 50 50 42 Z',
  'M 20 44 C 17 33 18 22 23 16 C 29 22 34 33 34 45 Z',
  'M 36 44 C 36 33 39 22 45 17 C 51 24 52 36 50 47 Z',
  'M 32 38 C 44 38 53 48 53 60 C 53 72 44 79 32 79 C 20 79 13 70 13 58 C 13 46 20 38 32 38 Z',
  // upper jaw and lower jaw as two prongs, leaving a snarling gap between them
  'M 28 42 C 14 44 2 49 -3 54 C -6 56 -5 60 -1 60 L 28 58 C 35 55 35 44 28 42 Z',
  'M 3 78 C -2 79 -2 85 4 86 L 26 82 C 33 79 33 71 27 70 L 7 74 Z',
  // two bold fangs; five small ones turned to mud at crest size
  'M 3 60 L 7 71 L 12 60 Z',
  'M 12 74 L 17 64 L 22 74 Z',
];

function Wolf({ transform }: { transform: string }) {
  return (
    <g transform={transform} fill={INK}>
      {WOLF_PARTS.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </g>
  );
}

const grass = (x: number, y: number) =>
  `M ${x} ${y} L ${x + 2} ${y - 8} L ${x + 4} ${y} Z ` +
  `M ${x + 5} ${y} L ${x + 8} ${y - 12} L ${x + 10} ${y} Z ` +
  `M ${x + 11} ${y} L ${x + 13} ${y - 6} L ${x + 15} ${y} Z`;

/** Subtle mottling on the moon's face. Kept low contrast so it never reads as blobs. */
function Craters({ cx, cy, s, idScale = 1 }: { cx: number; cy: number; s: number; idScale?: number }) {
  const k = s * idScale;
  return (
    <g fill="#c98f1c" opacity="0.17">
      <ellipse cx={cx - 26 * k} cy={cy - 28 * k} rx={16 * k} ry={12 * k} />
      <ellipse cx={cx + 26 * k} cy={cy + 16 * k} rx={19 * k} ry={14 * k} />
      <ellipse cx={cx - 14 * k} cy={cy + 34 * k} rx={11 * k} ry={8 * k} />
      <ellipse cx={cx + 38 * k} cy={cy - 34 * k} rx={8 * k} ry={6 * k} />
    </g>
  );
}

function MoonGradients({ prefix }: { prefix: string }) {
  return (
    <>
      <radialGradient id={`${prefix}Halo`} cx="50%" cy="50%" r="50%">
        <stop offset="48%" stopColor="#f5d038" stopOpacity="0.34" />
        <stop offset="100%" stopColor="#f5d038" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${prefix}Moon`} cx="44%" cy="38%" r="64%">
        <stop offset="0%" stopColor="#fff8cc" />
        <stop offset="42%" stopColor="#ffe066" />
        <stop offset="78%" stopColor="#f2c033" />
        <stop offset="100%" stopColor="#d59a20" />
      </radialGradient>
    </>
  );
}

// [centreX, height, halfWidth] — clustered at the left and right edges so the
// middle stays clear for the moon and the wolf.
const TREES: [number, number, number][] = [
  [4, 80, 20],
  [28, 58, 14],
  [50, 96, 23],
  [74, 48, 12],
  [96, 66, 16],
  [340, 56, 14],
  [362, 94, 22],
  [388, 66, 16],
  [412, 104, 25],
  [436, 60, 14],
];

export function Backdrop() {
  // Stable star field — regenerating each render would make it shimmer.
  const stars = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => {
        const seed = (i * 2654435761) % 4294967296;
        const rand = (offset: number) => ((seed >> offset) & 0xffff) / 0xffff;
        return {
          cx: rand(0) * 100,
          cy: rand(3) * 58,
          r: 0.1 + rand(7) * 0.22,
          delay: rand(11) * 4,
          duration: 3 + rand(5) * 4,
        };
      }),
    []
  );

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{ background: SKY }}
    >
      {/* Stars, stretched across the sky above the horizon */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g fill="#f6f2e4">
          {stars.map((star, i) => (
            <circle
              key={i}
              cx={star.cx}
              cy={star.cy}
              r={star.r}
              className="animate-twinkle"
              style={{ animationDelay: `${star.delay}s`, animationDuration: `${star.duration}s` }}
            />
          ))}
        </g>
      </svg>

      {/* The scene, pinned to the bottom at its natural aspect ratio. The min
          width keeps the moon dramatic on narrow phones. */}
      <svg
        className="absolute bottom-0 left-1/2 -translate-x-1/2"
        style={{ width: 'clamp(640px, 100%, 1400px)' }}
        viewBox="0 0 440 300"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <MoonGradients prefix="bd" />
          <linearGradient id="bdRidge" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0b1222" />
            <stop offset="100%" stopColor="#04060e" />
          </linearGradient>
        </defs>

        <circle cx="215" cy="118" r="158" fill="url(#bdHalo)" className="animate-moon-glow" />
        <circle cx="215" cy="118" r="100" fill="url(#bdMoon)" />
        <Craters cx={215} cy={118} s={1} />

        <path
          d="M0 232 L70 226 L140 232 L210 224 L280 231 L350 225 L410 232 L440 228 L440 300 L0 300 Z"
          fill="url(#bdRidge)"
        />
        {TREES.map(([cx, h, w], i) => (
          <path key={i} d={pine(cx, 250, h, w)} fill={INK} />
        ))}

        {/* Drawn after the ridge so the paws stand on the crest rather than
            being sliced off by it. */}
        <Wolf transform="translate(150 128) scale(0.79)" />

        <g fill={INK}>
          <path d={grass(130, 229)} />
          <path d={grass(300, 228)} />
          <path d={grass(330, 231)} />
        </g>
      </svg>

      {/* Vignette so overlaid text always has contrast */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(125% 85% at 50% 8%, transparent 34%, rgba(4,6,15,0.66) 100%)',
        }}
      />
    </div>
  );
}

/**
 * Circular medallion of the same scene, used as the mark on the join screen.
 * Cropping to a circle makes it read as a deliberate emblem rather than a
 * floating cut-out.
 */
export function MoonCrest({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 240"
      className={className}
      role="img"
      aria-label="A wolf prowling a ridge in front of a full moon"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <MoonGradients prefix="cr" />
        <clipPath id="crClip">
          <circle cx="120" cy="120" r="117" />
        </clipPath>
        <linearGradient id="crSky" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#2c6875" />
          <stop offset="45%" stopColor="#2b3260" />
          <stop offset="100%" stopColor="#160e2a" />
        </linearGradient>
      </defs>

      <g clipPath="url(#crClip)">
        <rect width="240" height="240" fill="url(#crSky)" />
        <circle cx="120" cy="104" r="130" fill="url(#crHalo)" className="animate-moon-glow" />
        <circle cx="120" cy="102" r="78" fill="url(#crMoon)" />
        <Craters cx={120} cy={102} s={0.85} />

        <path d="M0 198 L60 193 L120 199 L180 192 L240 198 L240 240 L0 240 Z" fill={INK} />
        <path d={pine(18, 200, 56, 14)} fill={INK} />
        <path d={pine(38, 200, 34, 9)} fill={INK} />
        <path d={pine(222, 200, 50, 13)} fill={INK} />
        <path d={pine(200, 200, 32, 9)} fill={INK} />

        <Wolf transform="translate(49 101) scale(0.76)" />
      </g>

      <circle
        cx="120"
        cy="120"
        r="117"
        fill="none"
        stroke="#dcc07c"
        strokeOpacity="0.45"
        strokeWidth="2"
      />
    </svg>
  );
}
