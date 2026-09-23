import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ok } from "./lib/api";
import { isOnline, statusLabel, timeAgo, type Device } from "./lib/device";
import ScreenTime from "./ScreenTime";

type Command = {
  id: string;
  type: string;
  payload: unknown;
  status: "pending" | "done" | "failed";
  error: string | null;
  createdAt: string;
  executedAt: string | null;
};
type App = { exeName: string; name: string; path: string | null; lastSeenAt: string };
type CommandInput =
  | { type: "show_message"; payload: { text: string } }
  | { type: "kill_app"; payload: { exeName: string } }
  | { type: "lock_session" };

const COMMAND_LABELS: Record<string, string> = {
  show_message: "Message",
  kill_app: "Fermer une app",
  lock_session: "Verrouillage",
};
const STATUS_LABELS: Record<Command["status"], string> = { pending: "en attente", done: "fait", failed: "échec" };

export default function DeviceDetail({ device, onBack }: { device: Device; onBack: () => void }) {
  const [commands, setCommands] = useState<Command[] | null>(null);
  const [apps, setApps] = useState<App[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const param = { param: { id: device.id } };

  const loadCommands = useCallback(async () => {
    try {
      const res = await ok(api.v1.devices[":id"].commands.$get({ param: { id: device.id } }));
      setCommands(((await res.json()) as { commands: Command[] }).commands);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [device.id]);

  useEffect(() => {
    loadCommands();
    const timer = setInterval(loadCommands, 5_000);
    return () => clearInterval(timer);
  }, [loadCommands]);

  useEffect(() => {
    ok(api.v1.devices[":id"].apps.$get({ param: { id: device.id } }))
      .then((res) => res.json() as Promise<{ apps: App[] }>)
      .then((body) => setApps(body.apps))
      .catch((e: Error) => setError(e.message));
  }, [device.id]);

  async function send(command: CommandInput) {
    setError(null);
    try {
      await ok(api.v1.devices[":id"].commands.$post({ ...param, json: command }));
      await loadCommands();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }

  function onMessage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const text = String(new FormData(form).get("text")).trim();
    if (text) send({ type: "show_message", payload: { text } }).then((sent) => sent && form.reset());
  }

  function onKill(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    let exeName = String(new FormData(form).get("exeName")).trim().toLowerCase();
    if (!exeName) return;
    if (!exeName.endsWith(".exe")) exeName += ".exe";
    send({ type: "kill_app", payload: { exeName } }).then((sent) => sent && form.reset());
  }

  function onLock() {
    if (confirm(`Verrouiller la session sur « ${device.name} » ?`)) send({ type: "lock_session" });
  }

  const online = isOnline(device);

  return (
    <section className="detail">
      <button className="link back" onClick={onBack}>
        ← Mes PC
      </button>

      <div className="detail-head">
        <div>
          <h1>{device.name}</h1>
          <p className="meta">
            <span className={`dot ${online ? "on" : ""}`} /> {statusLabel(device)}
            {device.agentVersion && <> · agent v{device.agentVersion}</>} · ajouté le{" "}
            {new Date(device.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {!online && <p className="notice">Le PC est hors ligne : les commandes partiront à sa prochaine connexion.</p>}

      <div className="grid">
        <div className="panel">
          <h2>Actions</h2>
          <form className="action" onSubmit={onMessage}>
            <label htmlFor="text">Afficher un message</label>
            <div className="inline">
              <input id="text" name="text" placeholder="On passe à table !" maxLength={500} required />
              <button>Envoyer</button>
            </div>
          </form>
          <form className="action" onSubmit={onKill}>
            <label htmlFor="exeName">Fermer une application</label>
            <div className="inline">
              <input id="exeName" name="exeName" placeholder="minecraft.exe" required />
              <button>Fermer</button>
            </div>
          </form>
          <div className="action">
            <label>Session Windows</label>
            <button className="danger" onClick={onLock}>
              Verrouiller maintenant
            </button>
          </div>
        </div>

        <div className="panel">
          <h2>Historique des commandes</h2>
          {commands === null ? (
            <p className="muted">Chargement…</p>
          ) : commands.length === 0 ? (
            <p className="muted">Aucune commande envoyée.</p>
          ) : (
            <ul className="commands">
              {commands.map((c) => (
                <li key={c.id}>
                  <div>
                    <strong>{COMMAND_LABELS[c.type] ?? c.type}</strong> <small>{describe(c)}</small>
                    {c.error && <small className="error">{c.error}</small>}
                  </div>
                  <div className="right">
                    <span className={`badge ${c.status}`}>{STATUS_LABELS[c.status]}</span>
                    <small>{timeAgo(c.createdAt)}</small>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ScreenTime deviceId={device.id} />

      <div className="panel">
        <h2>
          Applications installées {apps && apps.length > 0 && <span className="count">{apps.length}</span>}
        </h2>
        {apps === null ? (
          <p className="muted">Chargement…</p>
        ) : apps.length === 0 ? (
          <p className="muted">Aucune donnée pour l'instant : l'agent n'envoie pas encore l'inventaire.</p>
        ) : (
          <ul className="apps">
            {apps.map((a) => (
              <li key={a.exeName} title={a.path ?? undefined}>
                <span>{a.name}</span>
                <code>{a.exeName}</code>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function describe(c: Command) {
  const p = c.payload as { text?: string; exeName?: string } | null;
  if (p?.text) return `« ${p.text} »`;
  if (p?.exeName) return p.exeName;
  return "";
}
