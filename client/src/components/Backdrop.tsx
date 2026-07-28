import { useMemo } from 'react';

/**
 * Fixed village-at-night scene behind the whole app: moon, stars, drifting fog,
 * treeline and a wolf on the ridge. Pure inline SVG so there are no image
 * requests and it scales cleanly on any phone.
 */
export function Backdrop() {
  // Stable star field — regenerating on every render would make it shimmer.
  const stars = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => {
        const seed = (i * 2654435761) % 4294967296;
        const rand = (offset: number) => (((seed >> offset) & 0xffff) / 0xffff);
        return {
          cx: rand(0) * 100,
          cy: rand(3) * 62,
          r: 0.18 + rand(7) * 0.5,
          delay: rand(11) * 4,
          duration: 3 + rand(5) * 4,
        };
      }),
    []
  );

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <svg
        className="h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#05070f" />
            <stop offset="42%" stopColor="#0b1226" />
            <stop offset="72%" stopColor="#141c3a" />
            <stop offset="100%" stopColor="#070a16" />
          </linearGradient>

          <radialGradient id="moonHalo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f6f2e4" stopOpacity="0.55" />
            <stop offset="38%" stopColor="#e6d5a5" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#e6d5a5" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="moonBody" cx="38%" cy="34%" r="72%">
            <stop offset="0%" stopColor="#fffdf5" />
            <stop offset="70%" stopColor="#f2e8cd" />
            <stop offset="100%" stopColor="#ddcaa0" />
          </radialGradient>

          <linearGradient id="fog" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9fb0d4" stopOpacity="0" />
            <stop offset="100%" stopColor="#9fb0d4" stopOpacity="0.14" />
          </linearGradient>

          <linearGradient id="ridgeFar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#131c38" />
            <stop offset="100%" stopColor="#0a0f20" />
          </linearGradient>
        </defs>

        {/* Sky */}
        <rect width="100" height="100" fill="url(#sky)" />

        {/* Stars */}
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

        {/* Moon */}
        <g>
          <circle cx="74" cy="20" r="26" fill="url(#moonHalo)" className="animate-moon-glow" />
          <circle cx="74" cy="20" r="8.4" fill="url(#moonBody)" />
          {/* Craters, kept very low contrast */}
          <circle cx="71.4" cy="17.8" r="1.5" fill="#d9c69c" opacity="0.5" />
          <circle cx="76.4" cy="22.4" r="1.1" fill="#d9c69c" opacity="0.4" />
          <circle cx="75.2" cy="16.6" r="0.75" fill="#d9c69c" opacity="0.35" />
        </g>

        {/* Far ridge */}
        <path
          d="M0 74 L10 69 L18 72 L27 65 L36 71 L46 64 L55 70 L64 66 L74 72 L84 67 L92 71 L100 68 L100 100 L0 100 Z"
          fill="url(#ridgeFar)"
        />

        {/* Drifting fog band */}
        <g className="animate-drift">
          <rect x="-10" y="70" width="130" height="16" fill="url(#fog)" />
        </g>

        {/* Village rooftops with a few lit windows */}
        <g fill="#070b16">
          <path d="M6 84 L12 78 L18 84 L18 92 L6 92 Z" />
          <path d="M22 86 L28 80 L34 86 L34 92 L22 92 Z" />
          <path d="M40 85 L47 78 L54 85 L54 92 L40 92 Z" />
          <path d="M60 87 L66 81 L72 87 L72 92 L60 92 Z" />
          <path d="M78 85 L85 79 L92 85 L92 92 L78 92 Z" />
        </g>
        <g fill="#dcc07c" opacity="0.75">
          <rect x="10.6" y="84.6" width="2.2" height="2.4" rx="0.3" />
          <rect x="27" y="87" width="2" height="2.2" rx="0.3" />
          <rect x="46" y="85.6" width="2.4" height="2.6" rx="0.3" />
          <rect x="84" y="86" width="2.2" height="2.4" rx="0.3" />
        </g>

        {/* Treeline */}
        <g fill="#050810">
          {Array.from({ length: 26 }, (_, i) => {
            const x = i * 4 - 2;
            const h = 8 + ((i * 37) % 7);
            return <path key={i} d={`M${x} 92 L${x + 2} ${92 - h} L${x + 4} 92 Z`} />;
          })}
        </g>

        {/* Wolf silhouette on the near ridge, howling at the moon */}
        <g fill="#03050c" transform="translate(14 74) scale(0.09)">
          <path
            d="M120 180 L120 150 C120 138 126 128 138 122 L150 116 L146 96 C144 86 148 76 158 70
               L176 60 L170 40 L186 52 L204 44 L196 62 L214 74 C224 80 228 92 224 104 L216 128
               L232 140 C242 148 246 160 244 172 L242 186 L228 186 L228 170 L214 158 L200 164
               L186 160 L172 168 L160 186 L146 186 L152 168 L140 160 L134 180 Z"
          />
        </g>

        {/* Ground haze that fades the treeline into the page */}
        <rect x="0" y="88" width="100" height="12" fill="#04060f" opacity="0.85" />
      </svg>

      {/* Vignette so text always has contrast, whatever is behind it */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 80% at 50% 10%, transparent 38%, rgba(4,6,15,0.72) 100%)',
        }}
      />
    </div>
  );
}

/**
 * Compact moon-and-wolf crest used on the join screen and as a section mark.
 */
export function MoonCrest({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      role="img"
      aria-label="A wolf howling at a full moon"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="crestHalo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f6f2e4" stopOpacity="0.5" />
          <stop offset="60%" stopColor="#dcc07c" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#dcc07c" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="crestMoon" cx="36%" cy="32%" r="70%">
          <stop offset="0%" stopColor="#fffdf5" />
          <stop offset="72%" stopColor="#f0e6c8" />
          <stop offset="100%" stopColor="#d8c39a" />
        </radialGradient>
      </defs>

      <circle cx="60" cy="52" r="52" fill="url(#crestHalo)" className="animate-moon-glow" />
      <circle cx="60" cy="50" r="30" fill="url(#crestMoon)" />
      <circle cx="51" cy="42" r="5" fill="#d7c49c" opacity="0.45" />
      <circle cx="68" cy="58" r="3.6" fill="#d7c49c" opacity="0.38" />
      <circle cx="66" cy="39" r="2.4" fill="#d7c49c" opacity="0.32" />

      {/* Wolf head in profile, cut out of the moon */}
      <path
        d="M28 108 L34 84 C36 74 42 66 52 62 L48 46 C46 37 51 28 60 25 L74 19 L70 6 L82 15 L94 10
           L88 22 L100 30 C108 36 111 46 108 55 L102 74 L110 84 C115 91 116 100 114 108 Z"
        fill="#04060f"
      />
      <circle cx="78" cy="34" r="2.6" fill="#dcc07c" />
    </svg>
  );
}
