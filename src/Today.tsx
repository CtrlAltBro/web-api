import { useCallback, useMemo, useState, type CSSProperties } from "react";
import type { ScheduleState } from "./DeviceDetail";
import { Loader } from "./components/Loader";
import { Reveal } from "./components/Reveal";
import { Card } from "./ds";
import { api, ok } from "./lib/api";
import type { Device } from "./lib/device";
import { REFRESH_MS, dayKey, formatDuration, formatMinutes, nowHHMM, toMinutes, tz } from "./lib/format";
import { usePoll } from "./lib/poll";

type Usage = { day: string; app: string; exeName: string | null; seconds: number };
type Title = { day: string; app: string; title: string; seconds: number };

const DAYS = 7;
const TOP_APPS = 8;

function lastDays() {
  const today = new Date();
  return Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (DAYS - 1 - i));
    return { key: dayKey(d), date: d };
  });
}

// The headline of the page: how much screen time today, how much is left, and
// where it went. The week's bars pick another day.
export default function Today({ device, sched }: { device: Device; sched: ScheduleState | null }) {
  const days = useMemo(lastDays, []);
  const todayKey = days[DAYS - 1].key;
  const [usage, setUsage] = useState<Usage[] | null>(null);
  const [titles, setTitles] = useState<Title[]>([]);
  const [openApp, setOpenApp] = useState<string | null>(null);
  const [selected, setSelected] = useState(todayKey);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const from = days[0].date;
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + DAYS);
    try {
      const res = await ok(
        api.v1.devices[":id"]["screen-time"].$get({
          param: { id: device.id },
          query: { from: from.toISOString(), to: to.toISOString(), tz },
        }),
      );
      const body = (await res.json()) as { usage: Usage[]; titles: Title[] };
      setUsage(body.usage);
      setTitles(body.titles);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [device.id, days]);

  usePoll(load, REFRESH_MS);

  const totals = useMemo(() => {
    const byDay = new Map<string, number>(days.map((d) => [d.key, 0]));
    for (const u of usage ?? []) byDay.set(u.day, (byDay.get(u.day) ?? 0) + u.seconds);
    return byDay;
  }, [usage, days]);

  const apps = useMemo(() => {
    const byApp = new Map<string, number>();
    for (const u of usage ?? []) if (u.day === selected) byApp.set(u.app, (byApp.get(u.app) ?? 0) + u.seconds);
    const sorted = [...byApp].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, TOP_APPS);
    const rest = sorted.slice(TOP_APPS).reduce((sum, [, s]) => sum + s, 0);
    if (rest > 0) top.push([`Autres (${sorted.length - TOP_APPS})`, rest]);
    return top;
  }, [usage, selected]);

  const isToday = selected === todayKey;
  const selectedDate = days.find((d) => d.key === selected)!.date;
  const maxDay = Math.max(...totals.values(), 1);
  const maxApp = Math.max(...apps.map(([, s]) => s), 1);
  const trackedSince = new Date(device.createdAt);
  const partialWeek = trackedSince > days[0].date;

  return (
    <Card className="today-card" padding="var(--space-6)">
      <div className="today-card__head">
        <div>
          <p className="today-card__day">
            {isToday
              ? `Aujourd'hui, ${selectedDate.toLocaleDateString("fr-FR", { weekday: "long" })}`
              : selectedDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <p className="today-card__total" aria-live="polite">
            {usage === null ? "…" : formatDuration(totals.get(selected) ?? 0)}
          </p>
        </div>
        {isToday && sched && <Allowance sched={sched} />}
      </div>

      {isToday && sched && <UsageBar sched={sched} />}

      {error && <p className="form-error">{error}</p>}

      {usage === null ? (
        !error && <Loader />
      ) : (
        <>
          <div className="week" role="group" aria-label="Temps d'écran des 7 derniers jours">
            {days.map(({ key, date }, i) => {
              const seconds = totals.get(key) ?? 0;
              const label = key === todayKey ? "Auj." : date.toLocaleDateString("fr-FR", { weekday: "short" });
              const full = `${date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} : ${formatDuration(seconds)}`;
              return (
                <button
                  key={key}
                  className="week__day"
                  aria-pressed={key === selected}
                  aria-label={full}
                  title={full}
                  onClick={() => (setSelected(key), setOpenApp(null))}
                  style={{ "--i": i } as CSSProperties}
                >
                  <span className="week__value">{seconds ? formatDuration(seconds) : ""}</span>
                  <span className="week__area">
                    {seconds > 0 ? (
                      <span className="week__bar" style={{ height: `max(var(--space-1), ${(seconds / maxDay) * 100}%)` }} />
                    ) : (
                      <span className="week__empty" />
                    )}
                  </span>
                  <span className="week__label">{label}</span>
                </button>
              );
            })}
          </div>
          {partialWeek && (
            <p className="footnote">
              Suivi depuis{" "}
              {dayKey(trackedSince) === todayKey
                ? "aujourd'hui"
                : `le ${trackedSince.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric" })}`}{" "}
              : les jours précédents se rempliront au fil de la semaine.
            </p>
          )}

          {apps.length === 0 ? (
            <p className="muted today-card__none">
              {isToday ? "Rien d'enregistré aujourd'hui pour l'instant." : "Aucune utilisation enregistrée ce jour-là."}
            </p>
          ) : (
            <ul className="usage" key={selected}>
              {apps.map(([app, seconds], i) => {
                const appTitles = titles.filter((t) => t.day === selected && t.app === app);
                const has = appTitles.length > 0;
                const open = has && openApp === app;
                return (
                  <li key={app} className="usage__item" style={{ "--i": i } as CSSProperties}>
                    <button
                      className="usage__row"
                      onClick={() => has && setOpenApp(open ? null : app)}
                      aria-expanded={has ? open : undefined}
                      disabled={!has}
                    >
                      <span className="usage__name" title={app}>
                        <span className="usage__chev" aria-hidden="true" data-open={open}>
                          {has ? "▸" : ""}
                        </span>
                        <span className="usage__label">{app}</span>
                      </span>
                      <span className="usage__track">
                        <span className="usage__fill" style={{ width: `${(seconds / maxApp) * 100}%` }} />
                      </span>
                      <span className="usage__time">{formatDuration(seconds)}</span>
                    </button>
                    {has && (
                      <Reveal open={open}>
                        <ul className="usage__titles">
                          {appTitles.map((t) => (
                            <li key={t.title}>
                              <span title={t.title}>{t.title}</span>
                              <span className="usage__time">{formatDuration(t.seconds)}</span>
                            </li>
                          ))}
                        </ul>
                      </Reveal>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

function todayRules(sched: ScheduleState) {
  const day = sched.schedule.days[String(new Date().getDay()) as keyof typeof sched.schedule.days] ?? null;
  const cap = day?.maxMinutes ?? null;
  const allowed = cap === null ? null : cap + sched.extraMinutes;
  return { day, allowed };
}

// What is left today, in words: the cap (with bonus) and the time window.
function Allowance({ sched }: { sched: ScheduleState }) {
  const { day, allowed } = todayRules(sched);
  const remaining = allowed === null ? null : allowed - sched.usedTodaySeconds / 60;
  return (
    <div className="allowance">
      <p>
        {day === null ? (
          <strong>Pas de restriction aujourd'hui</strong>
        ) : allowed === null ? (
          <strong>Pas de temps max aujourd'hui</strong>
        ) : allowed === 0 ? (
          <strong>Journée sans écran</strong>
        ) : remaining! <= 0 ? (
          <>
            <strong className="allowance__over">Temps écoulé</strong> sur {formatMinutes(allowed)}
          </>
        ) : (
          <>
            <strong>Il reste {formatMinutes(remaining!)}</strong> sur {formatMinutes(allowed)}
            {sched.extraMinutes > 0 && " (bonus compris)"}
          </>
        )}
      </p>
      {day && day.windows.length > 0 && <p>{windowLine(day.windows)}</p>}
    </div>
  );
}

function windowLine(windows: { from: string; to: string }[]) {
  const now = nowHHMM();
  const sorted = [...windows].sort((a, b) => a.from.localeCompare(b.from));
  const current = sorted.find((w) => w.from <= now && now < w.to);
  if (current) return `Plage ${current.from} – ${current.to}, verrouillage à ${current.to}`;
  const next = sorted.find((w) => now < w.from);
  if (next) return `Verrouillé jusqu'à ${next.from} (plage ${next.from} – ${next.to})`;
  return "Plus de plage aujourd'hui : la session reste verrouillée";
}

function UsageBar({ sched }: { sched: ScheduleState }) {
  const { allowed } = todayRules(sched);
  if (!allowed) return null;
  const ratio = Math.min(1, sched.usedTodaySeconds / 60 / allowed);
  return (
    <div
      className="meter"
      role="progressbar"
      aria-label="Temps utilisé aujourd'hui"
      aria-valuemin={0}
      aria-valuemax={allowed}
      aria-valuenow={Math.round(sched.usedTodaySeconds / 60)}
      data-over={ratio >= 1}
    >
      <span className="meter__fill" style={{ width: `${ratio * 100}%` }} />
      {sched.extraMinutes > 0 && (
        <span className="meter__bonus" style={{ left: `${(1 - sched.extraMinutes / allowed) * 100}%` }} title="Bonus accordé" />
      )}
    </div>
  );
}

export { todayRules };
