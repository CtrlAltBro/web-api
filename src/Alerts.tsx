import { useState } from "react";
import { Reveal } from "./components/Reveal";
import { Button, KeyTag } from "./ds";
import { since, timeAgo, type Device } from "./lib/device";

export type TamperEvent = { id: string; type: string; detail: string | null; occurredAt: string };

const EVENT_LABELS: Record<string, string> = {
  app_killed: "App de contrôle fermée de force",
  service_restarted: "Service redémarré anormalement",
  clock_changed: "Heure du PC modifiée",
  timezone_changed: "Fuseau horaire modifié",
  pipe_spoof: "Tentative d'usurpation de l'app",
  safe_mode: "Démarrage en mode sans échec",
  uninstall: "Désinstallation de CtrlAltBro",
  app_renamed: "Application renommée pour contourner un blocage",
};

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
      {device.silentSince && (
        <div className="banner" role="alert">
          <KeyTag status="alert">Ne répond plus</KeyTag>
          <div className="banner__body">
            <p className="banner__title">
              Plus de nouvelles depuis {since(device.silentSince)}, alors que l'enfant était connecté
            </p>
            <p className="banner__text">
              Le PC ne s'est ni éteint ni mis en veille normalement. CtrlAltBro a peut-être été contourné (mode sans échec,
              extinction forcée, service arrêté…).
            </p>
          </div>
        </div>
      )}

      {fresh.slice(0, VISIBLE).map((e) => (
        <div key={e.id} className="banner" role="alert">
          <KeyTag status="alert">Contournement</KeyTag>
          <div className="banner__body">
            <p className="banner__title">
              {EVENT_LABELS[e.type] ?? e.type}{" "}
              <span className="banner__when" title={new Date(e.occurredAt).toLocaleString("fr-FR")}>
                · {timeAgo(e.occurredAt)}
              </span>
            </p>
            {(e.detail || e.type === "app_renamed") && (
              <p className="banner__text">
                {e.detail}
                {e.type === "app_renamed" && " Le blocage a été réappliqué."}
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => dismiss([e.id])}>
            Compris
          </Button>
        </div>
      ))}

      {(fresh.length > VISIBLE || (events?.length ?? 0) > 0) && (
        <div className="alerts__more">
          {fresh.length > VISIBLE && (
            <Button variant="ghost" size="sm" onClick={() => dismiss(fresh.map((e) => e.id))}>
              Tout marquer comme vu ({fresh.length})
            </Button>
          )}
          <Button variant="ghost" size="sm" aria-expanded={logOpen} onClick={() => setLogOpen(!logOpen)}>
            {logOpen ? "Masquer" : "Voir"} l'historique des alertes ({events?.length})
          </Button>
        </div>
      )}

      <Reveal open={logOpen}>
        <ul className="log">
          {(events ?? []).map((e) => (
            <li key={e.id} className="log__row">
              <span>
                <strong>{EVENT_LABELS[e.type] ?? e.type}</strong>
                {e.detail && <span className="muted"> {e.detail}</span>}
              </span>
              <span className="log__when" title={new Date(e.occurredAt).toLocaleString("fr-FR")}>
                {timeAgo(e.occurredAt)}
              </span>
            </li>
          ))}
        </ul>
      </Reveal>
    </div>
  );
}
