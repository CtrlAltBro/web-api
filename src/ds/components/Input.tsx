import { useId, type ComponentProps, type CSSProperties, type ReactNode } from "react";

export type InputProps = Omit<ComponentProps<"input">, "style"> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  suffix?: ReactNode;
  mono?: boolean;
  style?: CSSProperties;
};

export function Input({ label, hint, error, suffix, mono = false, disabled = false, id, style, className, ...rest }: InputProps) {
  const autoId = useId();
  const fid = id || autoId;
  const hintId = `${fid}-hint`;
  const cls = ["cab-field", mono && "cab-field--mono", error && "cab-field--error", disabled && "cab-field--disabled", className].filter(Boolean).join(" ");
  return (
    <div className={cls} style={style}>
      {label && <label className="cab-field__label" htmlFor={fid}>{label}</label>}
      <div className="cab-field__box">
        <input id={fid} disabled={disabled} aria-invalid={error ? true : undefined} aria-describedby={error || hint ? hintId : undefined} {...rest} />
        {suffix && <span className="cab-field__suffix">{suffix}</span>}
      </div>
      {(error || hint) && <span id={hintId} className="cab-field__hint">{error || hint}</span>}
    </div>
  );
}
