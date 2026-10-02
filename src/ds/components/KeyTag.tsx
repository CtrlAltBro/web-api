import type { CSSProperties, ReactNode } from "react";
import { Key, type KeySize, type KeyTone } from "./Key";

export type Status = "online" | "alert" | "offline";

const DOT: Record<Status, string> = { online: "var(--status-online)", alert: "var(--status-alert)", offline: "var(--status-offline)" };

// A key-shaped label for a state or a short value (a limit, a blocked app). Never pressable.
export function KeyTag({ children, tone = "cream", size = "xs", status, style }: { children: ReactNode; tone?: KeyTone; size?: KeySize; status?: Status; style?: CSSProperties }) {
  return (
    <Key tone={tone} size={size} pressable={false} style={style}>
      {status && <span aria-hidden="true" className="cab-keytag__dot" style={{ background: DOT[status] }} />}
      <span style={{ fontWeight: 600 }}>{children}</span>
    </Key>
  );
}
