import { useCallback, useEffect, useState } from "react";
import { api, ok } from "./lib/api";
import { formatDuration } from "./ScreenTime";

type Window = { from: string; to: string };
type Day = { windows: Window[]; maxMinutes: number | null };
type Sched = { days: Record<string, Day> };

// getDay(): 0 = Sunday. Shown Monday-first.
const DAYS = [
  { key: "1", label: "Lundi" },
  { key: "2", label: "Mardi" },
  { key: "3", label: "Mercredi" },
  { key: "4", label: "Jeudi" },
  { key: "5", label: "Vendredi" },
  { key: "6", label: "Samedi" },
  { key: "0", label: "Dimanche" },
];

const emptyDay: Day = { windows: [], maxMinutes: null };

export default function Schedule({ deviceId }: { deviceId: string }) {
  const [sched, setSched] = useState<Sched | null>(null);
  const [used, setUsed] = useState<{ seconds: number; extra: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await ok(api.v1.devices[":id"].schedule.$get({ param: { id: deviceId } }));
      const j = (await res.json()) as { schedule: Sched; usedTodaySeconds: number; extraMinutes: number };
      setSched({ days: j.schedule.days ?? {} });
      setUsed({ seconds: j.usedTodaySeconds, extra: j.extraMinutes });
      setDirty(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [deviceId]);

  useEffect(() => {
    load();
  }, [load]);

  function edit(key: string, day: Day | null) {
    if (!sched) return;
    const days = { ...sched.days };
    if (day) days[key] = day;
    else delete days[key];
    setSched({ days });
    setDirty(true);
  }

  async function save() {
    if (!sched) return;
    setError(null);
    try {
      await ok(api.v1.devices[":id"].schedule.$put({ param: { id: deviceId }, json: sched }));
      setDirty(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function grant(extraMinutes: number) {
    setError(null);
    try {
      await ok(api.v1.devices[":id"]["time-grants"].$post({ param: { id: deviceId }, json: { extraMinutes } }));
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Horaires</h2>
        {dirty && <button className="link" onClick={save}>Enregistrer</button>}
      </div>
      {error && <p className="error">{error}</p>}
      {sched === null ? (
        <p className="muted">Chargement…</p>
      ) : (
        <>
          {used && (
            <p className="muted">
              Aujourd'hui : {formatDuration(used.seconds)} d'écran{used.extra ? ` (+${used.extra} min accordées)` : ""}.{" "}
              <button className="link" onClick={() => grant(15)}>+15 min</button>{" "}
              <button className="link" onClick={() => grant(30)}>+30 min</button>{" "}
              <button className="link" onClick={() => grant(60)}>+1 h</button>
            </p>
          )}
          <ul className="sched-list">
            {DAYS.map(({ key, label }) => {
              const day = sched.days[key] ?? null;
              return (
                <li key={key} className="sched-day">
                  <label className="sched-toggle">
                    <input
                      type="checkbox"
                      checked={day !== null}
                      onChange={(e) => edit(key, e.target.checked ? emptyDay : null)}
                    />
                    <strong>{label}</strong>
                  </label>
                  {day === null ? (
                    <span className="muted">Sans restriction</span>
                  ) : (
                    <div className="sched-body">
                      <div className="sched-windows">
                        {day.windows.length === 0 && <span className="muted">Toute la journée</span>}
                        {day.windows.map((w, i) => (
                          <span key={i} className="sched-window">
                            <input
                              type="time"
                              value={w.from}
                              onChange={(e) => {
                                const windows = day.windows.map((x, j) => (j === i ? { ...x, from: e.target.value } : x));
                                edit(key, { ...day, windows });
                              }}
                            />
                            {" – "}
                            <input
                              type="time"
                              value={w.to}
                              onChange={(e) => {
                                const windows = day.windows.map((x, j) => (j === i ? { ...x, to: e.target.value } : x));
                                edit(key, { ...day, windows });
                              }}
                            />
                            <button
                              className="link"
                              onClick={() => edit(key, { ...day, windows: day.windows.filter((_, j) => j !== i) })}
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                        <button
                          className="link"
                          onClick={() => edit(key, { ...day, windows: [...day.windows, { from: "07:00", to: "21:00" }] })}
                        >
                          + plage
                        </button>
                      </div>
                      <label className="sched-max">
                        Temps max :{" "}
                        <input
                          type="number"
                          min={0}
                          max={1440}
                          placeholder="illimité"
                          value={day.maxMinutes ?? ""}
                          onChange={(e) =>
                            edit(key, { ...day, maxMinutes: e.target.value === "" ? null : Number(e.target.value) })
                          }
                        />{" "}
                        min
                      </label>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="muted">
            En dehors des plages ou une fois le temps max atteint, la session de l'enfant est verrouillée. Sans plage, les
            horaires sont libres et seul le temps max compte ; un temps max de 0 bloque la journée.
          </p>
        </>
      )}
    </div>
  );
}
