import type { CSSProperties, HTMLAttributes, MouseEventHandler, ReactNode } from "react";

export type KeyTone = "cream" | "violet" | "sun" | "night";
export type KeySize = "xs" | "sm" | "md" | "lg";

export type KeyProps = Omit<HTMLAttributes<HTMLElement>, "onClick"> & {
  children?: ReactNode;
  tone?: KeyTone;
  size?: KeySize;
  pressable?: boolean;
  pressed?: boolean;
  square?: boolean;
  block?: boolean;
  href?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  className?: string;
  style?: CSSProperties;
};

// The 3D keyboard key: the brand's central element. The top sinks on press and
// springs back with a slight bounce (see components/keys.css).
export function Key({
  children,
  tone = "cream",
  size = "md",
  pressable,
  pressed = false,
  square = false,
  block = false,
  href,
  onClick,
  disabled = false,
  type = "button",
  className = "",
  style,
  ...rest
}: KeyProps) {
  const isPressable = !disabled && (pressable ?? Boolean(onClick || href || type === "submit"));
  const Tag = href ? "a" : onClick || pressable || type !== "button" ? "button" : "span";
  const cls = [
    "cab-key",
    `cab-key--${tone}`,
    `cab-key--${size}`,
    isPressable && "cab-key--pressable",
    pressed && "is-pressed",
    square && "cab-key--square",
    block && "cab-key--block",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const extra = Tag === "button" ? { type, disabled } : Tag === "a" ? { href, "aria-disabled": disabled || undefined } : {};
  return (
    <Tag className={cls} style={style} onClick={disabled ? undefined : onClick} {...extra} {...rest}>
      <span className="cab-key__shadow" aria-hidden="true" />
      <span className="cab-key__skirt" aria-hidden="true" />
      <span className="cab-key__top">{children}</span>
    </Tag>
  );
}
