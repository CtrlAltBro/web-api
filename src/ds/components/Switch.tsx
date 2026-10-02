import type { CSSProperties, ReactNode } from "react";

// On/off switch: a small cream key sliding in a rail.
export function Switch({ checked, defaultChecked, onChange, label, disabled = false, style, "aria-label": ariaLabel }: { checked?: boolean; defaultChecked?: boolean; onChange?: (checked: boolean) => void; label?: ReactNode; disabled?: boolean; style?: CSSProperties; "aria-label"?: string }) {
  return (
    <label className="cab-switch" style={style}>
      <input type="checkbox" role="switch" checked={checked} defaultChecked={defaultChecked} disabled={disabled} aria-label={ariaLabel} onChange={(e) => onChange?.(e.target.checked)} />
      <span className="cab-switch__track"><span className="cab-switch__knob" /></span>
      {label && <span>{label}</span>}
    </label>
  );
}
