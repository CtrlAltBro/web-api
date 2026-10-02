import { useCallback, useEffect, useState, type FormEvent } from "react";
import Alerts, { type TamperEvent } from "./Alerts";
import Applications from "./Applications";
import Controls, { type Command, type CommandInput } from "./Controls";
import Schedule, { type Sched } from "./Schedule";
import Today from "./Today";
import Web from "./Web";
import { Button, Input, StatusDot } from "./ds";
import { api, ok } from "./lib/api";
import { deviceStatus, isOnline, type Device } from "./lib/device";
import { REFRESH_MS } from "./lib/format";
import { usePoll } from "./lib/poll";

export type App = { exeName: string; name: string; path: string | null; lastSeenAt: string };
export type ScheduleState = { schedule: Sched; usedTodaySeconds: number; extraMinutes: number };

// One PC: today first (time used, quick actions), then the standing rules
// (hours, applications, web) in the order a parent tunes them.
export default function DeviceDetail({ device, onRenamed }: { device: Device; onRenamed: () => void }) {
  const [commands, setCommands] = useState<Command[] | null>(null);
  const [apps, setApps] = useState<App[] | null>(null);
  const [sched, setSched] = useState<ScheduleState | null>(null);
  const [events, setEvents] = useState<TamperEvent[] | null>(null);
  const id = device.id;

  const loadCommands = useCallback(async () => {
    const res = await ok(api.v1.devices[":id"].commands.$get({ param: { id } })).catch(() => null);
    if (res) setCommands(((await res.json()) as { commands: Command[] }).commands);
  }, [id]);

  const loadSchedule = useCallback(async () => {
    const res = await ok(api.v1.devices[":id"].schedule.$get({ param: { id } })).catch(() => null);
    if (!res) return;
    const j = (await res.json()) as ScheduleState;
    setSched({ ...j, schedule: { days: j.schedule.days ?? {} } });
  }, [id]);

  const loadEvents = useCallback(async () => {
    const res = await ok(api.v1.devices[":id"].events.$get({ param: { id } })).catch(() => null);
    if (res) setEvents(((await res.json()) as { events: TamperEvent[] }).events);
  }, [id]);

  usePoll(loadCommands, 5_000);
  usePoll(loadSchedule, REFRESH_MS);
  usePoll(loadEvents, REFRESH_MS);

  // Tell the API a parent is watching so the agent streams in fast mode.
  useEffect(() => {
    const beat = () => api.v1.devices[":id"].heartbeat.$post({ param: { id } }).catch(() => {});
    beat();
    const timer = setInterval(beat, 30_000);
    return () => clearInterval(timer);
  }, [id]);

  useEffect(() => {
    ok(api.v1.devices[":id"].apps.$get({ param: { id } }))
      .then((res) => res.json() as Promise<{ apps: App[] }>)
      .then((body) => setApps(body.apps))
      .catch(() => setApps([]));
  }, [id]);

  async function send(command: CommandInput) {
    await ok(api.v1.devices[":id"].commands.$post({ param: { id }, json: command }));
    await loadCommands();
  }

  return (
    <article className="device">
      <Header device={device} send={send} onRenamed={onRenamed} />
      <Alerts device={device} events={events} />

      <section className="today" aria-label="Aujourd'hui">
        <Today device={device} sched={sched} />
        <Controls device={device} apps={apps ?? []} commands={commands} sched={sched} send={send} onGranted={loadSchedule} />
      </section>

      <Schedule deviceId={id} sched={sched} onSaved={loadSchedule} />
      <Applications deviceId={id} apps={apps} />
      <Web deviceId={id} />
    </article>
  );
}

function Header({ device, send, onRenamed }: { device: Device; send: (c: CommandInput) => Promise<void>; onRenamed: () => void }) {
  const { status, label } = deviceStatus(device);
  const [renaming, setRenaming] = useState(false);
  const [recal, setRecal] = useState<"idle" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (recal === "idle") return;
    const timer = setTimeout(() => setRecal("idle"), 4000);
    return () => clearTimeout(timer);
  }, [recal]);

  async function recalibrate() {
    try {
      await send({ type: "recalibrate" });
      setRecal("sent");
    } catch {
      setRecal("error");
    }
  }

  async function rename(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name")).trim();
    if (!name || name === device.name) return setRenaming(false);
    try {
      await ok(api.v1.devices[":id"].$patch({ param: { id: device.id }, json: { name } }));
      setError(null);
      setRenaming(false);
      onRenamed();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <header className="device-head">
      <a className="back-link" href="#">
        ← Mes PC
      </a>
      {renaming ? (
        <form className="rename" onSubmit={rename}>
          <Input
            name="name"
            aria-label="Nom du PC"
            defaultValue={device.name}
            maxLength={100}
            autoFocus
            error={error}
            onKeyDown={(e) => e.key === "Escape" && setRenaming(false)}
          />
          <Button type="submit">Renommer</Button>
          <Button variant="ghost" size="sm" onClick={() => setRenaming(false)}>
            Annuler
          </Button>
        </form>
      ) : (
        <h1 className="device-head__name">
          <button className="device-head__rename" onClick={() => setRenaming(true)} title="Renommer ce PC">
            {device.name}
          </button>
        </h1>
      )}
      <div className="device-head__meta">
        <StatusDot status={status} label={label} />
        <span className="device-head__facts">
          {device.agentVersion && <>Agent v{device.agentVersion} · </>}ajouté le{" "}
          {new Date(device.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} ·{" "}
          <button
            className="text-action"
            onClick={recalibrate}
            title="Lève les blocages posés par l'agent, si une règle a coincé à tort. Les limites encore dépassées se réappliquent."
          >
            Recalibrer l'agent
          </button>
          {recal === "sent" && (
            <span className="flash flash--ok" role="status">
              {isOnline(device) ? "blocages levés" : "partira à la reconnexion"}
            </span>
          )}
          {recal === "error" && (
            <span className="flash flash--error" role="status">
              échec, réessayez
            </span>
          )}
        </span>
      </div>
    </header>
  );
}
