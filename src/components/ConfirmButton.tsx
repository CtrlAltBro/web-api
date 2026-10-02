import { useEffect, useState, type ReactNode } from "react";
import { Button } from "../ds";

// A ghost action that asks for a second click instead of a browser dialog;
// it disarms by itself after a few seconds.
export function ConfirmButton({ children, confirm, onConfirm }: { children: ReactNode; confirm: ReactNode; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);
  return (
    <Button
      variant="ghost"
      size="sm"
      className={armed ? "is-armed" : undefined}
      aria-live="polite"
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
    >
      {armed ? confirm : children}
    </Button>
  );
}
