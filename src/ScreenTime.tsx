import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { api, ok } from "./lib/api";

type Usage = { day: string; app: string; exeName: string | null; seconds: number };
type Title = { day: string; app: string; title: string; seconds: number };
type Tip = { x: number; y: number; text: string } | null;

const DAYS = 7;
const TOP_APPS = 8;
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function formatDuration(seconds: number) {
  if (seconds < 60) return seconds > 0 ? "< 1 min" : "0 min";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}

function lastDays() {
  const today = new Date();
  return Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (DAYS - 1 - i));
    return { key: dayKey(d), date: d };
  });
}

export default function ScreenTime({ deviceId }: { deviceId: string }) {
  const days = useMemo(lastDays, []);
  const todayKey = days[DAYS - 1].key;
  const [usage, setUsage] = useState<Usage[] | null>(null);
  const [titles, setTitles] = useState<Title[]>([]);
  const [openApp, setOpenApp] = useState<string | null>(null);
  const [selected, setSelected] = useState(todayKey);
  const [error, setError] = useState<string | null>(null);
  const [tip, setTip] = useState<Tip>(null);

  const load = useCallback(async () => {
    const from = days[0].date;
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + DAYS);
    try {
      const res = await ok(
        api.v1.devices[":id"]["screen-time"].$get({
          param: { id: deviceId },
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
  }, [deviceId, days]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

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

  const maxDay = Math.max(...totals.values(), 1);
  const maxApp = Math.max(...apps.map(([, s]) => s), 1);
  const selectedDate = days.find((d) => d.key === selected)!.date;
  const selectedLabel =
    selected === todayKey
      ? "Aujourd'hui"
      : selectedDate.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  function showTip(e: MouseEvent, text: string) {
    const box = e.currentTarget.getBoundingClientRect();
    setTip({ x: box.left + box.width / 2, y: box.top, text });
  }

  return (
    <div className="panel screen-time">
      <h2>Temps d'écran</h2>
      {error && <p className="error">{error}</p>}
      {usage === null ? (
        <p className="muted">Chargement…</p>
      ) : (
        <>
          <p className="st-headline">
            <span className="st-total">{formatDuration(totals.get(selected) ?? 0)}</span>
            <span className="muted">{selectedLabel}</span>
          </p>

          <div className="st-cols" role="group" aria-label="Temps d'écran des 7 derniers jours">
            {days.map(({ key, date }) => {
              const seconds = totals.get(key) ?? 0;
              const label = key === todayKey ? "Auj." : date.toLocaleDateString(undefined, { weekday: "short" });
              const full = `${date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })} : ${formatDuration(seconds)}`;
              return (
                <button
                  key={key}
                  className={`st-col ${key === selected ? "selected" : ""}`}
                  onClick={() => setSelected(key)}
                  onMouseEnter={(e) => showTip(e, full)}
                  onMouseLeave={() => setTip(null)}
                  aria-pressed={key === selected}
                  aria-label={full}
                >
                  <span className="st-bar-area">
                    <span className="st-bar" style={{ height: seconds ? `max(2px, ${(seconds / maxDay) * 100}%)` : 0 }} />
                  </span>
                  <span className="st-day">{label}</span>
                </button>
              );
            })}
          </div>

          {apps.length === 0 ? (
            <p className="muted">Aucune utilisation enregistrée ce jour-là.</p>
          ) : (
            <ul className="st-apps">
              {apps.map(([app, seconds]) => {
                const appTitles = titles.filter((t) => t.day === selected && t.app === app);
                const open = openApp === app && appTitles.length > 0;
                return (
                  <li key={app}>
                    <button
                      className="st-row"
                      onClick={() => setOpenApp(open ? null : app)}
                      disabled={appTitles.length === 0}
                      aria-expanded={appTitles.length ? open : undefined}
                    >
                      <span className="st-app-name" title={app}>
                        {appTitles.length > 0 && <span className="st-caret">{open ? "▾" : "▸"}</span>}
                        {app}
                      </span>
                      <span className="st-track">
                        <span className="st-fill" style={{ width: `${(seconds / maxApp) * 100}%` }} />
                      </span>
                      <span className="st-app-time">{formatDuration(seconds)}</span>
                    </button>
                    {open && (
                      <ul className="st-titles">
                        {appTitles.map((t) => (
                          <li key={t.title}>
                            <span title={t.title}>{t.title}</span>
                            <span className="st-app-time">{formatDuration(t.seconds)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      {tip && (
        <div className="tooltip" style={{ left: tip.x, top: tip.y }} role="tooltip">
          {tip.text}
        </div>
      )}
    </div>
  );
}
