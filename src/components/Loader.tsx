import { Key } from "../ds";

// Three small keys pressed in turn, like the logo's signature animation.
export function Loader({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="loader" role="status">
      <span className="loader__keys" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <Key key={i} tone={i === 2 ? "violet" : "cream"} size="xs" square />
        ))}
      </span>
      <span className="loader__label">{label}</span>
    </div>
  );
}
