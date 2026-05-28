export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-label="Sentinel logo"
      role="img"
    >
      {/* Shield with concentric inner mark — sober, fintech */}
      <path
        d="M16 2 L28 7 V16 C28 23 22.5 28 16 30 C9.5 28 4 23 4 16 V7 Z"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
      />
      <path
        d="M16 9 L22 12 V17 C22 20.5 19.4 23 16 24 C12.6 23 10 20.5 10 17 V12 Z"
        fill="currentColor"
        opacity="0.18"
      />
      <circle cx="16" cy="15" r="2.3" fill="currentColor" />
      <path
        d="M16 17.3 V22"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
