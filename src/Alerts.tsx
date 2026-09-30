import { useCallback, useEffect, useState } from "react";
import { api, ok } from "./lib/api";
import { timeAgo } from "./lib/device";

type TamperEvent = { id: string; type: string; detail: string | null; occurredAt: string };

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

const REFRESH_MS = 15_000;

export default function Alerts({ deviceId }: { deviceId: string }) {
  const [events, setEvents] = useState<TamperEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await ok(api.v1.devices[":id"].events.$get({ param: { id: deviceId } }));
      setEvents(((await res.json()) as { events: TamperEvent[] }).events);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [deviceId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="panel">
      <h2>
        Alertes {events && events.length > 0 && <span className="count">{events.length}</span>}
      </h2>
      {error && <p className="error">{error}</p>}
      {events === null ? (
        <p className="muted">Chargement…</p>
      ) : events.length === 0 ? (
        <p className="muted">Aucune tentative de contournement détectée.</p>
      ) : (
        <ul className="commands">
          {events.map((e) => (
            <li key={e.id}>
              <div>
                <strong>{EVENT_LABELS[e.type] ?? e.type}</strong>
                {e.detail && <small>{e.detail}</small>}
              </div>
              <div className="right">
                <small title={new Date(e.occurredAt).toLocaleString()}>{timeAgo(e.occurredAt)}</small>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
