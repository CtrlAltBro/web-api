import { useEffect, useRef } from "react";

// Runs `load` now and every `ms` while the tab is visible, and again when it comes back.
export function usePoll(load: () => unknown, ms: number) {
  const ref = useRef(load);
  ref.current = load;
  useEffect(() => {
    const run = () => document.visibilityState === "visible" && ref.current();
    ref.current();
    const timer = setInterval(run, ms);
    document.addEventListener("visibilitychange", run);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", run);
    };
  }, [load, ms]);
}
