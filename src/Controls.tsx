import { useEffect, useState, type FormEvent } from "react";
import type { App, ScheduleState } from "./DeviceDetail";
import { todayRules } from "./Today";
import { Button, Input, Key } from "./ds";
import { api, ok } from "./lib/api";
import { isOnline, timeAgo, type Device } from "./lib/device";
import { formatMinutes } from "./lib/format";

export type Command = {
  id: string;
  type: string;
  payload: unknown;
  status: "pending" | "done" | "failed";
  error: string | null;
  createdAt: string;
  executedAt: string | null;
};
export type CommandInput =
  | { type: "show_message"; payload: { text: string } }
  | { type: "kill_app"; payload: { exeName: string } }
  | { type: "lock_session" }
  | { type: "recalibrate" };

const COMMAND_LABELS: Record<string, string> = {
  show_message: "Message",
  kill_app: "Fermeture",
  lock_session: "Verrouillage",
  recalibrate: "Recalibrage",
};
const STATUS_LABELS: Record<Command["status"], string> = { pending: "en attente", done: "fait", failed: "échec" };
const RECENT = 5;

// What a parent does right now, next to what is happening right now: extra time,
// a message, a lock, closing an app. Rare, standing settings live further down.
export default function Controls({
  device,
  apps,
  commands,
  sched,
  send,
  onGranted,
}: {
  device: Device;
  apps: App[];
  commands: Command[] | null;
  sched: ScheduleState | null;
  send: (c: CommandInput) => Promise<void>;
  onGranted: () => void;
}) {
  const [error, setError] = useState<{ zone: string; text: string } | null>(null);
  const [lockArmed, setLockArmed] = useState(false);
  const [allCommands, setAllCommands] = useState(false);
  const capped = sched ? todayRules(sched).allowed !== null : false;

  useEffect(() => {
    if (!lockArmed) return;
    const timer = setTimeout(() => setLockArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [lockArmed]);

  async function run(zone: string, action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      return true;
    } catch (e) {
      setError({ zone, text: (e as Error).message });
      return false;
    }
  }

  const grant = (extraMinutes: number) =>
    run("grant", async () => {
      await ok(api.v1.devices[":id"]["time-grants"].$post({ param: { id: device.id }, json: { extraMinutes } }));
      onGranted();
    });

  function onMessage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const text = String(new FormData(form).get("text")).trim();
    if (text) run("message", () => send({ type: "show_message", payload: { text } })).then((sent) => sent && form.reset());
  }

  function onKill(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const value = String(new FormData(form).get("exeName")).trim().toLowerCase();
    if (!value) return;
    const byName = apps.find((a) => a.name.toLowerCase() === value);
    const exeName = byName ? byName.exeName : value.endsWith(".exe") ? value : `${value}.exe`;
    run("kill", () => send({ type: "kill_app", payload: { exeName } })).then((sent) => sent && form.reset());
  }

  function onLock() {
    if (!lockArmed) return setLockArmed(true);
    setLockArmed(false);
    run("lock", () => send({ type: "lock_session" }));
  }

  const errorFor = (zone: string) => (error?.zone === zone ? error.text : undefined);
  const shown = allCommands ? commands : commands?.slice(0, RECENT);

  return (
    <div className="controls">
      {!isOnline(device) && !device.silentSince && (
        <p className="controls__offline">Le PC est hors ligne. Les commandes partiront dès qu'il se reconnecte.</p>
      )}

      <div className="control">
        <h2 className="control__title">Donner du temps en plus</h2>
        <div className="control__keys">
          {[15, 30, 60].map((m) => (
            <Key key={m} tone="cream" size="sm" onClick={() => grant(m)} disabled={sched !== null && !capped}>
              +{formatMinutes(m)}
            </Key>
          ))}
        </div>
        {errorFor("grant") ? (
          <p className="form-error">{errorFor("grant")}</p>
        ) : sched && !capped ? (
          <p className="control__hint">Pas de temps max aujourd'hui : il n'y a rien à prolonger.</p>
        ) : (
          sched &&
          sched.extraMinutes > 0 && (
            <p className="control__hint" key={sched.extraMinutes}>
              <span className="flash flash--ok">{formatMinutes(sched.extraMinutes)} accordées aujourd'hui.</span>
            </p>
          )
        )}
      </div>

      <form className="control" onSubmit={onMessage}>
        <h2 className="control__title">
          <label htmlFor="message">Lui écrire</label>
        </h2>
        <div className="control__inline">
          <Input id="message" name="text" placeholder="On passe à table !" maxLength={500} required error={errorFor("message")} />
          <Button type="submit">Envoyer</Button>
        </div>
      </form>

      <div className="control">
        <Key tone="cream" size="md" block onClick={onLock} className={lockArmed ? "lock-key is-armed" : "lock-key"} aria-live="polite">
          {lockArmed ? "Confirmer le verrouillage" : "Verrouiller la session maintenant"}
        </Key>
        {errorFor("lock") ? (
          <p className="form-error">{errorFor("lock")}</p>
        ) : (
          <p className="control__hint">Les applications restent ouvertes : rien de ce qui est en cours n'est perdu.</p>
        )}
      </div>

      <form className="control" onSubmit={onKill}>
        <h2 className="control__title">
          <label htmlFor="kill">Fermer une application</label>
        </h2>
        <div className="control__inline">
          <Input id="kill" name="exeName" placeholder="minecraft.exe" list={`kill-apps-${device.id}`} mono required error={errorFor("kill")} />
          <Button type="submit" variant="secondary">
            Fermer
          </Button>
        </div>
        <datalist id={`kill-apps-${device.id}`}>
          {apps.map((a) => (
            <option key={a.exeName} value={a.exeName}>
              {a.name}
            </option>
          ))}
        </datalist>
        <p className="control__hint">Elle se ferme une fois, sans être bloquée. Pour l'empêcher de revenir, ajoutez une règle.</p>
      </form>

      {commands && commands.length > 0 && (
        <div className="history">
          <h3 className="history__title">Dernières commandes</h3>
          <ul>
            {shown!.map((c) => (
              <li key={c.id} className="history__row">
                <span className="history__what">
                  <strong>{COMMAND_LABELS[c.type] ?? c.type}</strong> <span className="muted">{describe(c)}</span>
                  {c.error && <span className="history__error">{c.error}</span>}
                </span>
                <span className="history__when">
                  <span className={`history__status history__status--${c.status}`}>{STATUS_LABELS[c.status]}</span> ·{" "}
                  {timeAgo(c.createdAt)}
                </span>
              </li>
            ))}
          </ul>
          {commands.length > RECENT && (
            <Button variant="ghost" size="sm" onClick={() => setAllCommands(!allCommands)} aria-expanded={allCommands}>
              {allCommands ? "Voir moins" : `Voir les ${commands.length} dernières`}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function describe(c: Command) {
  const p = c.payload as { text?: string; exeName?: string } | null;
  if (p?.text) return `« ${p.text} »`;
  if (p?.exeName) return p.exeName;
  return "";
}
