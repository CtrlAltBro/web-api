import type { CSSProperties } from "react";
import type { Status } from "./KeyTag";

const DEFAULT: Record<Status, string> = { online: "En ligne", alert: "Ne répond plus", offline: "Hors ligne" };

// A device's state dot, always with a label (color alone is not enough).
export function StatusDot({ status = "online", label, style }: { status?: Status; label?: string; style?: CSSProperties }) {
  return (
    <span className={`cab-status cab-status--${status}`} style={style}>
      <span aria-hidden="true" className="cab-status__dot" />
      {label === undefined ? DEFAULT[status] : label}
    </span>
  );
}
