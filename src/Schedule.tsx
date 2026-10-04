import { useEffect, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { ScheduleState } from "./DeviceDetail";
import { Loader } from "./components/Loader";
import { Reveal } from "./components/Reveal";
import { Button, Input, Switch } from "./ds";
import { api, ok } from "./lib/api";
import i18n from "./i18n";
import { formatMinutes, nowHHMM, toMinutes } from "./lib/format";

type Window = { from: string; to: string };
type Day = { windows: Window[]; maxMinutes: number | null };
type DayKey = "0" | "1" | "2" | "3" | "4" | "5" | "6";
export type Sched = { days: Partial<Record<DayKey, Day>> };

// getDay(): 0 = Sunday. Shown Monday-first.
const DAYS: DayKey[] = ["1", "2", "3", "4", "5", "6", "0"];
const MAX_WINDOWS = 6;
const pct = (hhmm: string) => `${(toMinutes(hhmm) / 1440) * 100}%`;

function summary(day: Day | null) {
  if (!day) return i18n.t("schedule.noRestriction");
  if (day.maxMinutes === 0) return i18n.t("schedule.noScreen");
  const hours = day.windows.length ? day.windows.map((w) => `${w.from} – ${w.to}`).join(", ") : i18n.t("schedule.allDay");
  return day.maxMinutes === null ? hours : `${hours} · ${i18n.t("schedule.max", { time: formatMinutes(day.maxMinutes) })}`;
}

// The week at a glance as a timeline; one day opens at a time to be edited.
export default function Schedule({ deviceId, sched, onSaved }: { deviceId: string; sched: ScheduleState | null; onSaved: () => Promise<void> }) {
  const { t } = useTranslation();
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
          {t("schedule.title")}
        </h2>
        <p className="block__lede">
          {t("schedule.lede")}
        </p>
      </div>

      {sched === null ? (
        <Loader />
      ) : (
        <div className="week-plan">
          <div className="week-plan__axis" aria-hidden="true">
            <span />
            <span className="week-plan__hours">
              {[0, 6, 12, 18, 24].map((h) => (
                <span key={h}>{t("schedule.hour", { h })}</span>
              ))}
            </span>
          </div>
          {DAYS.map((key) => {
            const open = editing?.key === key;
            const day = open ? editing.day : (sched.schedule.days[key] ?? null);
            const isToday = key === today;
            return (
              <div key={key} className="plan-day" data-open={open}>
                <div className="plan-day__row">
                  <span className="plan-day__name">
                    {t(`schedule.days.${key}`)}
                    {isToday && <span className="plan-day__today">{t("schedule.todayTag")}</span>}
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
                    {isToday && <span className="plan-day__now" style={{ left: pct(now) }} title={t("schedule.now", { time: now })} />}
                  </span>
                  <span className="plan-day__summary">{summary(day)}</span>
                  <Button variant="ghost" size="sm" onClick={() => toggle(key)} aria-expanded={open} disabled={saving}>
                    {open ? (saving ? "…" : t("common.ok")) : t("common.edit")}
                  </Button>
                </div>
                <Reveal open={open}>
                  {open && <DayEditor dayKey={key} day={editing.day} onChange={draft} error={error} onCancel={() => (setEditing(null), setError(null))} />}
                </Reveal>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function DayEditor({ dayKey, day, onChange, error, onCancel }: { dayKey: DayKey; day: Day | null; onChange: (d: Day | null) => void; error: string | null; onCancel: () => void }) {
  const { t } = useTranslation();
  const setWindow = (i: number, w: Partial<Window>) =>
    day && onChange({ ...day, windows: day.windows.map((x, j) => (j === i ? { ...x, ...w } : x)) });

  return (
    <div className="day-editor">
      <Switch
        label={t("schedule.restrict", { day: t(`schedule.dayIn.${dayKey}`) })}
        checked={day !== null}
        onChange={(on) => onChange(on ? { windows: [{ from: "16:30", to: "21:00" }], maxMinutes: 120 } : null)}
      />
      {day && (
        <>
          <div className="day-editor__windows">
            {day.windows.map((w, i) => (
              <div key={i} className="day-editor__window">
                <Input label={t("schedule.from")} type="time" value={w.from} onChange={(e) => setWindow(i, { from: e.target.value })} required />
                <Input label={t("schedule.to")} type="time" value={w.to} onChange={(e) => setWindow(i, { to: e.target.value })} required />
                <Button variant="ghost" size="sm" onClick={() => onChange({ ...day, windows: day.windows.filter((_, j) => j !== i) })}>
                  {t("schedule.remove")}
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
                {t(day.windows.length ? "schedule.addWindow" : "schedule.firstWindow")}
              </Button>
            )}
          </div>
          <Input
            label={t("schedule.maxLabel")}
            type="number"
            min={0}
            max={1440}
            step={15}
            suffix="min"
            placeholder={t("schedule.unlimited")}
            hint={t("schedule.maxHint")}
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
        {t("common.cancel")}
      </Button>
    </div>
  );
}
