import { Info } from "lucide-react";
import type { ReactNode } from "react";

export function HelpTip({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <span className="has-tooltip relative inline-flex items-center gap-1">
      {children}
      <Info size={11} className="text-ink-400" aria-hidden />
      <span className="tooltip">{text}</span>
    </span>
  );
}
