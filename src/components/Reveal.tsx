import type { ReactNode } from "react";

// Progressive disclosure: the content unfolds (grid rows 0fr → 1fr) and is inert while closed.
export function Reveal({ open, children, className = "" }: { open: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={`reveal ${className}`} data-open={open} inert={!open}>
      <div className="reveal__inner">{children}</div>
    </div>
  );
}
