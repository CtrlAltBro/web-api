import { useTranslation } from "react-i18next";
import { Key } from "../ds";

// Three small keys pressed in turn, like the logo's signature animation.
export function Loader({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div className="loader" role="status">
      <span className="loader__keys" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <Key key={i} tone={i === 2 ? "violet" : "cream"} size="xs" square />
        ))}
      </span>
      <span className="loader__label">{label ?? t("common.loading")}</span>
    </div>
  );
}
