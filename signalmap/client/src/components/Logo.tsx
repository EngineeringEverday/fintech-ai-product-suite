interface LogoProps {
  size?: number;
  showWordmark?: boolean;
  className?: string;
}

export function Logo({ size = 28, showWordmark = true, className = "" }: LogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`} aria-label="SignalMap">
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <defs>
          <radialGradient id="sm-grad-a" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#22e6a8" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#22e6a8" stopOpacity="0.55" />
          </radialGradient>
          <radialGradient id="sm-grad-b" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#ff5f7e" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#ff5f7e" stopOpacity="0.55" />
          </radialGradient>
        </defs>
        {/* connective lines */}
        <path
          d="M22 22 L42 24 M22 22 L22 42 M22 42 L44 44 M42 24 L44 44"
          stroke="currentColor"
          strokeOpacity="0.35"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* cluster bubbles */}
        <circle cx="42" cy="24" r="12" fill="url(#sm-grad-a)" />
        <circle cx="22" cy="42" r="8" fill="url(#sm-grad-a)" />
        <circle cx="44" cy="44" r="5" fill="url(#sm-grad-b)" />
        <circle cx="22" cy="22" r="3" fill="currentColor" fillOpacity="0.85" />
      </svg>
      {showWordmark && (
        <span className="font-semibold tracking-tight text-foreground text-[15px]">
          Signal<span className="text-emerald-400">Map</span>
        </span>
      )}
    </div>
  );
}
