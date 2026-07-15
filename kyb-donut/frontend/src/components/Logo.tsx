// Custom mark: concentric ring referencing the Donut model's encoder-decoder
// loop. Monochrome, scales 16px -> 200px, uses currentColor for theming.
export function Logo({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      aria-label="KYB Donut"
      className={className}
    >
      <rect width="32" height="32" rx="7" fill="currentColor" opacity="0.08" />
      <circle cx="16" cy="16" r="9" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="16" cy="16" r="3.4" stroke="currentColor" strokeWidth="2.4" />
      <path d="M16 4 V7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
