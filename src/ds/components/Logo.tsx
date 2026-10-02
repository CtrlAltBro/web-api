import { useEffect, useState, type CSSProperties, type MouseEventHandler } from "react";
import { Key, type KeyTone } from "./Key";

const LABELS: [string, KeyTone][] = [["Ctrl", "cream"], ["Alt", "cream"], ["Bro", "violet"]];

// The logo in 3D keys. With `animate`, Ctrl, Alt and Bro sink once, one after the
// other (--logo-step apart), when it appears.
export function Logo({ size = 64, animate = false, pressable = false, onClick, href, style }: { size?: number; animate?: boolean; pressable?: boolean; onClick?: MouseEventHandler<HTMLElement>; href?: string; style?: CSSProperties }) {
  const [down, setDown] = useState(-1);
  useEffect(() => {
    if (!animate) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const step = 170, hold = 150, timers: number[] = [];
    LABELS.forEach((_, i) => {
      timers.push(window.setTimeout(() => setDown(i), 350 + i * step));
      timers.push(window.setTimeout(() => setDown((d) => (d === i ? -1 : d)), 350 + i * step + hold));
    });
    return () => timers.forEach(clearTimeout);
  }, [animate]);
  const W = size;
  const vars = {
    "--h": `${(W * 198) / 212}px`, "--depth": `${(W * 36) / 212}px`, "--inset": `${(W * 14) / 212}px`,
    "--r": `${(W * 34) / 212}px`, "--rt": `${(W * 26) / 212}px`, "--px": "0px", "--fs": `${(W * 58) / 212}px`,
    "--shine-top": `${(W * 6) / 212}px`, "--shine-x": `${(W * 12) / 212}px`, "--shine-h": `${(W * 6) / 212}px`,
    width: `${W}px`,
  } as CSSProperties;
  const Wrap = href ? "a" : "span";
  return (
    <Wrap href={href} onClick={onClick} aria-label="CtrlAltBro" className="cab-logo" style={{ gap: `${(W * 28) / 212}px`, ...style }}>
      {LABELS.map(([label, tone], i) => (
        <Key key={label} tone={tone} pressable={pressable || Boolean(onClick || href)} pressed={down === i} style={vars} aria-hidden="true">
          {label}
        </Key>
      ))}
    </Wrap>
  );
}
