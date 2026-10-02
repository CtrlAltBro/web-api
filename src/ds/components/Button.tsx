import type { CSSProperties, HTMLAttributes, MouseEventHandler, ReactNode } from "react";
import { Key } from "./Key";

export type ButtonProps = Omit<HTMLAttributes<HTMLElement>, "onClick"> & {
  children?: ReactNode;
  variant?: "primary" | "secondary" | "accent" | "ghost";
  size?: "sm" | "md" | "lg";
  block?: boolean;
  href?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  style?: CSSProperties;
};

// Action button, drawn as a key that really sinks. One primary (violet) per visible
// zone; ghost for secondary links and rare actions.
export function Button({ children, variant = "primary", size = "md", block = false, href, onClick, disabled = false, type = "button", className, style, ...rest }: ButtonProps) {
  if (variant === "ghost") {
    const cls = ["cab-ghost", size === "sm" && "cab-ghost--sm", className].filter(Boolean).join(" ");
    if (href) return <a className={cls} href={href} onClick={onClick} style={style} {...rest}>{children}</a>;
    return <button className={cls} onClick={onClick} disabled={disabled} type={type} style={style} {...rest}>{children}</button>;
  }
  const tone = variant === "primary" ? "violet" : variant === "accent" ? "sun" : "cream";
  return (
    <Key tone={tone} size={size} block={block} href={href} onClick={onClick || (!href ? () => {} : undefined)} disabled={disabled} type={type} className={className} style={style} {...rest}>
      {children}
    </Key>
  );
}
