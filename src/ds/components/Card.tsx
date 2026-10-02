import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

export type CardProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  children?: ReactNode;
  variant?: "raised" | "flat" | "sunken";
  title?: ReactNode;
  aside?: ReactNode;
  padding?: CSSProperties["padding"];
  style?: CSSProperties;
};

// Content container: raised (default), flat (inside a list), sunken (secondary zone).
export function Card({ children, variant = "raised", title, aside, padding, className = "", style, ...rest }: CardProps) {
  return (
    <div className={`cab-card cab-card--${variant} ${className}`} style={{ padding, ...style }} {...rest}>
      {(title || aside) && (
        <div className="cab-card__head">
          {title && <div className="cab-card__title">{title}</div>}
          {aside}
        </div>
      )}
      {children}
    </div>
  );
}
