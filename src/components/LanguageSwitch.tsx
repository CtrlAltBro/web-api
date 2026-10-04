import { useTranslation } from "react-i18next";
import { Key } from "../ds";
import { LANGUAGES, setLanguage } from "../i18n";

// FR / EN as two small keys: the current language stays pressed.
export function LanguageSwitch() {
  const { t, i18n } = useTranslation();
  return (
    <span className="lang-switch" role="radiogroup" aria-label={t("lang.label")}>
      {LANGUAGES.map(({ code, short, name }) => {
        const active = i18n.resolvedLanguage === code;
        return (
          <Key
            key={code}
            tone={active ? "violet" : "cream"}
            size="xs"
            pressable
            pressed={active}
            role="radio"
            aria-checked={active}
            aria-label={name}
            title={name}
            lang={code}
            onClick={() => !active && setLanguage(code)}
          >
            {short}
          </Key>
        );
      })}
    </span>
  );
}
