import { useMemo } from 'react';

/**
 * Artwork for the night theme: a huge gold moon low on the horizon, the village
 * silhouetted on the ridge with a few windows still lit, spiky conifers, and
 * several pairs of eyes watching from the dark.
 *
 * All inline SVG, so there are no image requests and it stays crisp at any
 * density. Everything here was rendered offline and reviewed before landing.
 */

const INK = '#04070e';
/** Warm lamplight in the village windows. */
const LIT = '#ffd670';

// The sky lives on the container as CSS rather than inside the SVG. A full-bleed
// SVG with preserveAspectRatio="slice" crops brutally on tall phone viewports —
// you end up seeing only the middle of the moon — so the scene SVG is anchored
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

/** Gabled cottage. A narrow, tall one with a spire on top becomes the church. */
const house = (x: number, baseY: number, w: number, h: number, roofH: number) =>
  `M ${x} ${baseY} L ${x} ${baseY - h} L ${x + w / 2} ${baseY - h - roofH} ` +
  `L ${x + w} ${baseY - h} L ${x + w} ${baseY} Z`;

const chimney = (x: number, baseY: number, w: number, h: number) =>
  `M ${x} ${baseY} L ${x} ${baseY - h} L ${x + w} ${baseY - h} L ${x + w} ${baseY} Z`;

function Window({ x, y, w = 3, h = 3.6, o = 0.9 }: { x: number; y: number; w?: number; h?: number; o?: number }) {
  return <rect x={x} y={y} width={w} height={h} rx="0.5" fill={LIT} opacity={o} />;
}

/** A pair of eyes in the dark. The glow is what sells it, not the pupils. */
function Eyes({ x, y, s = 1, o = 0.95, glowId }: { x: number; y: number; s?: number; o?: number; glowId: string }) {
  return (
    <g opacity={o}>
      <ellipse cx={x} cy={y} rx={9 * s} ry={6 * s} fill={`url(#${glowId})`} />
      <ellipse cx={x + 5.6 * s} cy={y} rx={9 * s} ry={6 * s} fill={`url(#${glowId})`} />
      <ellipse cx={x} cy={y} rx={1.5 * s} ry={1.05 * s} fill="#ffcf4d" />
      <ellipse cx={x + 5.6 * s} cy={y} rx={1.5 * s} ry={1.05 * s} fill="#ffcf4d" />
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
      <radialGradient id={`${prefix}EyeGlow`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#ffcf4d" stopOpacity="0.55" />
        <stop offset="100%" stopColor="#ffcf4d" stopOpacity="0" />
      </radialGradient>
    </>
  );
}

/** Subtle mottling on the moon's face, kept low contrast so it never reads as blobs. */
function Craters({ cx, cy, s }: { cx: number; cy: number; s: number }) {
  return (
    <g fill="#c98f1c" opacity="0.17">
      <ellipse cx={cx - 26 * s} cy={cy - 28 * s} rx={16 * s} ry={12 * s} />
      <ellipse cx={cx + 26 * s} cy={cy + 16 * s} rx={19 * s} ry={14 * s} />
      <ellipse cx={cx - 14 * s} cy={cy + 34 * s} rx={11 * s} ry={8 * s} />
      <ellipse cx={cx + 38 * s} cy={cy - 34 * s} rx={8 * s} ry={6 * s} />
    </g>
  );
}

// [centreX, height, halfWidth] — clustered at the edges so the middle stays
// clear for the moon and the village.
const TREES: [number, number, number][] = [
  [4, 84, 21],
  [26, 60, 15],
  [48, 100, 24],
  [70, 52, 13],
  [90, 70, 17],
  [106, 46, 12],
  [330, 50, 13],
  [348, 86, 21],
  [372, 62, 16],
  [396, 104, 25],
  [420, 66, 16],
  [438, 84, 20],
];

/** Village baseline in the backdrop's coordinate space. */
const BASE = 236;

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

        {/* Village, silhouetted against the moon */}
        <g fill={INK}>
          <path d={house(112, BASE, 27, 15, 10)} />
          <path d={chimney(131, BASE - 22, 4, 7)} />
          <path d={house(144, BASE, 21, 11, 8)} />
          <path d={house(170, BASE, 32, 19, 13)} />
          <path d={chimney(194, BASE - 29, 4.5, 8)} />
          {/* church tower, the tallest thing in the village */}
          <path d={house(210, BASE, 17, 30, 17)} />
          <path d={`M 217 ${BASE - 47} L 218.5 ${BASE - 57} L 220 ${BASE - 47} Z`} />
          <path d={house(232, BASE, 29, 17, 11)} />
          <path d={chimney(252, BASE - 25, 4, 7)} />
          <path d={house(266, BASE, 22, 12, 8)} />
          <path d={house(292, BASE, 27, 15, 10)} />
        </g>
        <Window x={120} y={BASE - 12} />
        <Window x={126} y={BASE - 12} o={0.5} />
        <Window x={151} y={BASE - 8} w={2.6} h={3} />
        <Window x={178} y={BASE - 15} />
        <Window x={185} y={BASE - 15} />
        <Window x={192} y={BASE - 15} o={0.45} />
        <Window x={216} y={BASE - 34} w={2.6} h={4.5} o={0.8} />
        <Window x={216} y={BASE - 14} w={2.6} h={3.4} o={0.55} />
        <Window x={240} y={BASE - 13} />
        <Window x={248} y={BASE - 13} o={0.5} />
        <Window x={273} y={BASE - 9} w={2.6} h={3} o={0.75} />
        <Window x={300} y={BASE - 12} />
        <Window x={307} y={BASE - 12} o={0.45} />

        <path
          d="M0 240 L70 234 L140 240 L210 233 L280 239 L350 234 L410 240 L440 236 L440 300 L0 300 Z"
          fill="url(#bdRidge)"
        />
        {TREES.map(([cx, h, w], i) => (
          <path key={i} d={pine(cx, 258, h, w)} fill={INK} />
        ))}

        {/* Something is watching the village */}
        <Eyes x={58} y={250} s={1.1} glowId="bdEyeGlow" />
        <Eyes x={96} y={244} s={0.85} o={0.8} glowId="bdEyeGlow" />
        <Eyes x={360} y={248} s={1} glowId="bdEyeGlow" />
        <Eyes x={404} y={252} s={0.8} o={0.7} glowId="bdEyeGlow" />
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
