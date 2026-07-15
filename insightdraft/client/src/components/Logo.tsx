interface LogoProps {
  size?: number;
  className?: string;
  showWordmark?: boolean;
}

export function Logo({ size = 28, className = '', showWordmark = true }: LogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`} data-testid="logo-insightdraft">
      <svg
        aria-label="InsightDraft logo"
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="32" height="32" rx="7" fill="currentColor" className="text-primary" />
        {/* Three vertical bars suggesting drafts being filtered down; a punctuation dot
            on the third bar implies the human signal/decision moment. */}
        <path
          d="M9 22V10M16 22V10M23 22V15"
          stroke="hsl(var(--primary-foreground))"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle cx="23" cy="11.2" r="1.6" fill="hsl(var(--primary-foreground))" />
      </svg>
      {showWordmark && (
        <span className="font-semibold tracking-tight text-[15px]">
          InsightDraft
        </span>
      )}
    </div>
  );
}
