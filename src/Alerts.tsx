import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Reveal } from "./components/Reveal";
import { Button, KeyTag } from "./ds";
import { since, timeAgo, type Device } from "./lib/device";
import { locale } from "./i18n";

export type TamperEvent = { id: string; type: string; detail: string | null; occurredAt: string };

const VISIBLE = 3;

// Seen alerts are remembered in this browser only: the API keeps every event.
const seenKey = (deviceId: string) => `cab-seen-events:${deviceId}`;
function readSeen(deviceId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(seenKey(deviceId)) ?? "[]");
  } catch {
    return [];
  }
}

// Bypass attempts and a silent agent are exceptional: they open the page as banners,
// until the parent says "Compris". The full log stays one click away.
export default function Alerts({ device, events }: { device: Device; events: TamperEvent[] | null }) {
  const { t, i18n } = useTranslation();
  const label = (type: string) => (i18n.exists(`alerts.events.${type}`) ? t(`alerts.events.${type}` as "alerts.events.uninstall") : type);
  const silent = device.silentSince ? since(device.silentSince) : null;
  const [seen, setSeen] = useState(() => readSeen(device.id));
  const [logOpen, setLogOpen] = useState(false);
  const fresh = (events ?? []).filter((e) => !seen.includes(e.id));

  function dismiss(ids: string[]) {
    const next = [...ids, ...seen].slice(0, 200);
    setSeen(next);
    try {
      localStorage.setItem(seenKey(device.id), JSON.stringify(next));
    } catch {}
  }

  return (
    <div className="alerts">
      {silent && (
        <div className="banner" role="alert">
          <KeyTag status="alert">{t("alerts.notResponding")}</KeyTag>
          <div className="banner__body">
            <p className="banner__title">
              {t("alerts.silentTitle", { since: silent.text, context: silent.date ? "date" : undefined })}
            </p>
            <p className="banner__text">{t("alerts.silentText")}</p>
          </div>
        </div>
      )}

      {fresh.slice(0, VISIBLE).map((e) => (
        <div key={e.id} className="banner" role="alert">
          <KeyTag status="alert">{t("alerts.bypass")}</KeyTag>
          <div className="banner__body">
            <p className="banner__title">
              {label(e.type)}{" "}
              <span className="banner__when" title={new Date(e.occurredAt).toLocaleString(locale())}>
                · {timeAgo(e.occurredAt)}
              </span>
            </p>
            {(e.detail || e.type === "app_renamed") && (
              <p className="banner__text">
                {e.detail}
                {e.type === "app_renamed" && ` ${t("alerts.reapplied")}`}
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => dismiss([e.id])}>
            {t("alerts.gotIt")}
          </Button>
        </div>
      ))}

      {(fresh.length > VISIBLE || (events?.length ?? 0) > 0) && (
        <div className="alerts__more">
          {fresh.length > VISIBLE && (
            <Button variant="ghost" size="sm" onClick={() => dismiss(fresh.map((e) => e.id))}>
              {t("alerts.markAll", { count: fresh.length })}
            </Button>
          )}
          <Button variant="ghost" size="sm" aria-expanded={logOpen} onClick={() => setLogOpen(!logOpen)}>
            {t(logOpen ? "alerts.hideLog" : "alerts.showLog", { count: events?.length ?? 0 })}
          </Button>
        </div>
      )}

      <Reveal open={logOpen}>
        <ul className="log">
          {(events ?? []).map((e) => (
            <li key={e.id} className="log__row">
              <span>
                <strong>{label(e.type)}</strong>
                {e.detail && <span className="muted"> {e.detail}</span>}
              </span>
              <span className="log__when" title={new Date(e.occurredAt).toLocaleString(locale())}>
                {timeAgo(e.occurredAt)}
              </span>
            </li>
          ))}
        </ul>
      </Reveal>
    </div>
  );
}
