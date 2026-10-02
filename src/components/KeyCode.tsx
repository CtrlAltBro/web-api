import { useEffect, useState } from "react";
import { Key } from "../ds";

// A pairing code typed out on keys: each key sinks once, in order, when the code appears.
export function KeyCode({ code }: { code: string }) {
  const [down, setDown] = useState(-1);
  const chars = [...code];
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timers = chars.flatMap((_, i) => [
      window.setTimeout(() => setDown(i), 200 + i * 90),
      window.setTimeout(() => setDown((d) => (d === i ? -1 : d)), 200 + i * 90 + 120),
    ]);
    return () => timers.forEach(clearTimeout);
  }, [code]);
  return (
    <span className="key-code" aria-label={chars.join(" ")}>
      {chars.map((c, i) =>
        c === "-" ? (
          <span key={i} className="key-code__dash" aria-hidden="true" />
        ) : (
          <Key key={i} size="md" square pressed={down === i} aria-hidden="true" className="key-code__key">
            {c}
          </Key>
        ),
      )}
    </span>
  );
}
