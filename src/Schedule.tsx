import { useEffect, useState, type CSSProperties } from "react";
import type { ScheduleState } from "./DeviceDetail";
import { Loader } from "./components/Loader";
import { Reveal } from "./components/Reveal";
import { Button, Input, Switch } from "./ds";
import { api, ok } from "./lib/api";
import { formatMinutes, nowHHMM, toMinutes } from "./lib/format";

type Window = { from: string; to: string };
type Day = { windows: Window[]; maxMinutes: number | null };
type DayKey = "0" | "1" | "2" | "3" | "4" | "5" | "6";
export type Sched = { days: Partial<Record<DayKey, Day>> };

// getDay(): 0 = Sunday. Shown Monday-first.
const DAYS: { key: DayKey; label: string }[] = [
  { key: "1", label: "Lundi" },
  { key: "2", label: "Mardi" },
  { key: "3", label: "Mercredi" },
  { key: "4", label: "Jeudi" },
  { key: "5", label: "Vendredi" },
  { key: "6", label: "Samedi" },
  { key: "0", label: "Dimanche" },
];
const MAX_WINDOWS = 6;
const pct = (hhmm: string) => `${(toMinutes(hhmm) / 1440) * 100}%`;

function summary(day: Day | null) {
  if (!day) return "Sans restriction";
  if (day.maxMinutes === 0) return "Journée sans écran";
  const hours = day.windows.length ? day.windows.map((w) => `${w.from} – ${w.to}`).join(", ") : "Toute la journée";
  return day.maxMinutes === null ? hours : `${hours} · ${formatMinutes(day.maxMinutes)} max`;
}

// The week at a glance as a timeline; one day opens at a time to be edited.
export default function Schedule({ deviceId, sched, onSaved }: { deviceId: string; sched: ScheduleState | null; onSaved: () => Promise<void> }) {
  const [editing, setEditing] = useState<{ key: DayKey; day: Day | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(nowHHMM);
  const today = String(new Date().getDay());

  useEffect(() => {
    const timer = setInterval(() => setNow(nowHHMM()), 60_000);
    return () => clearInterval(timer);
  }, []);

  async function save(next: { key: DayKey; day: Day | null }) {
    if (!sched) return false;
    const days = { ...sched.schedule.days };
    if (next.day) days[next.key] = next.day;
    else delete days[next.key];
    if (JSON.stringify(days) === JSON.stringify(sched.schedule.days)) return true;
    setSaving(true);
    setError(null);
    try {
      await ok(api.v1.devices[":id"].schedule.$put({ param: { id: deviceId }, json: { days } }));
      await onSaved();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  // Opening another day saves the one being edited first.
  async function toggle(key: DayKey) {
    if (editing && !(await save(editing))) return;
    setEditing(editing?.key === key ? null : { key, day: sched?.schedule.days[key] ?? null });
  }

  const draft = (day: Day | null) => editing && setEditing({ ...editing, day });

  return (
    <section className="block" aria-labelledby="schedule-title">
      <div className="block__head">
        <h2 id="schedule-title" className="block__title">
          Horaires
        </h2>
        <p className="block__lede">
          Hors de la plage, ou une fois le temps max atteint, la session se verrouille. Sans plage, seul le temps max
          compte ; 0 min bloque la journée.
        </p>
      </div>

      {sched === null ? (
        <Loader />
      ) : (
        <div className="week-plan">
          <div className="week-plan__axis" aria-hidden="true">
            <span />
            <span className="week-plan__hours">
              <span>0 h</span>
              <span>6 h</span>
              <span>12 h</span>
              <span>18 h</span>
              <span>24 h</span>
            </span>
          </div>
          {DAYS.map(({ key, label }) => {
            const open = editing?.key === key;
            const day = open ? editing.day : (sched.schedule.days[key] ?? null);
            const isToday = key === today;
            return (
              <div key={key} className="plan-day" data-open={open}>
                <div className="plan-day__row">
                  <span className="plan-day__name" data-today={isToday}>
                    {label}
                  </span>
                  <span className="plan-day__track" aria-hidden="true">
                    {day && day.maxMinutes !== 0 && day.windows.length === 0 && <span className="plan-day__all" />}
                    {day &&
                      day.maxMinutes !== 0 &&
                      day.windows.map((w, i) => (
                        <span
                          key={i}
                          className="plan-day__window"
                          style={{ left: pct(w.from), width: `calc(${pct(w.to)} - ${pct(w.from)})` } as CSSProperties}
                        />
                      ))}
                    {isToday && <span className="plan-day__now" style={{ left: pct(now) }} title={`Maintenant, ${now}`} />}
                  </span>
                  <span className="plan-day__summary">{summary(day)}</span>
                  <Button variant="ghost" size="sm" onClick={() => toggle(key)} aria-expanded={open} disabled={saving}>
                    {open ? (saving ? "…" : "OK") : "Modifier"}
                  </Button>
                </div>
                <Reveal open={open}>
                  {open && <DayEditor label={label} day={editing.day} onChange={draft} error={error} onCancel={() => (setEditing(null), setError(null))} />}
                </Reveal>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function DayEditor({ label, day, onChange, error, onCancel }: { label: string; day: Day | null; onChange: (d: Day | null) => void; error: string | null; onCancel: () => void }) {
  const setWindow = (i: number, w: Partial<Window>) =>
    day && onChange({ ...day, windows: day.windows.map((x, j) => (j === i ? { ...x, ...w } : x)) });

  return (
    <div className="day-editor">
      <Switch
        label={`Encadrer le ${label.toLowerCase()}`}
        checked={day !== null}
        onChange={(on) => onChange(on ? { windows: [{ from: "16:30", to: "21:00" }], maxMinutes: 120 } : null)}
      />
      {day && (
        <>
          <div className="day-editor__windows">
            {day.windows.map((w, i) => (
              <div key={i} className="day-editor__window">
                <Input label="De" type="time" value={w.from} onChange={(e) => setWindow(i, { from: e.target.value })} required />
                <Input label="À" type="time" value={w.to} onChange={(e) => setWindow(i, { to: e.target.value })} required />
                <Button variant="ghost" size="sm" onClick={() => onChange({ ...day, windows: day.windows.filter((_, j) => j !== i) })}>
                  Retirer
                </Button>
              </div>
            ))}
            {day.windows.length < MAX_WINDOWS && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const last = day.windows.at(-1);
                  const from = last && last.to < "22:00" ? last.to : "07:00";
                  onChange({ ...day, windows: [...day.windows, { from, to: from < "21:00" ? "21:00" : "23:00" }] });
                }}
              >
                {day.windows.length ? "+ Ajouter une plage" : "+ Limiter à une plage horaire"}
              </Button>
            )}
          </div>
          <Input
            label="Temps max"
            type="number"
            min={0}
            max={1440}
            step={15}
            suffix="min"
            placeholder="illimité"
            hint="Vide : pas de plafond."
            value={day.maxMinutes ?? ""}
            onChange={(e) => onChange({ ...day, maxMinutes: e.target.value === "" ? null : Number(e.target.value) })}
            className="day-editor__max"
          />
        </>
      )}
      {error && (
        <p className="form-error day-editor__error" role="alert">
          {error}
        </p>
      )}
      <Button variant="ghost" size="sm" onClick={onCancel} className="day-editor__cancel">
        Annuler
      </Button>
    </div>
  );
}
