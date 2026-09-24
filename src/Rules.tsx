import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { api, ok } from "./lib/api";
import { REFRESH_MS, formatDuration } from "./ScreenTime";

type Rule = {
  id: string;
  type: "app" | "site";
  target: string;
  mode: "block" | "limit";
  dailyLimitMinutes: number | null;
  active: boolean;
  // Today's usage since local midnight or the latest reset.
  usedTodaySeconds: number;
};
type App = { exeName: string; name: string };

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

// Accepts an exe name, an app name from the inventory, or a bare name like "minecraft".
function toExeName(input: string, apps: App[]) {
  const value = input.trim().toLowerCase();
  const byName = apps.find((a) => a.name.toLowerCase() === value);
  if (byName) return byName.exeName;
  return value.endsWith(".exe") ? value : `${value}.exe`;
}

export default function Rules({ deviceId, apps }: { deviceId: string; apps: App[] }) {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [mode, setMode] = useState<"limit" | "block">("limit");
  const [error, setError] = useState<string | null>(null);
  const appNames = useMemo(() => new Map(apps.map((a) => [a.exeName, a.name])), [apps]);

  const load = useCallback(async () => {
    try {
      const res = await ok(api.v1.devices[":id"].rules.$get({ param: { id: deviceId }, query: { tz } }));
      setRules(((await res.json()) as { rules: Rule[] }).rules.filter((r) => r.type === "app"));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [deviceId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function save(target: string, ruleMode: "limit" | "block", minutes?: number) {
    setError(null);
    const json =
      ruleMode === "block"
        ? { type: "app" as const, target, mode: "block" as const }
        : { type: "app" as const, target, mode: "limit" as const, dailyLimitMinutes: minutes ?? 60 };
    try {
      await ok(api.v1.devices[":id"].rules.$put({ param: { id: deviceId }, json }));
      await load();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }

  function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const target = toExeName(String(data.get("target")), apps);
    const minutes = Number(data.get("minutes"));
    save(target, mode, minutes).then((saved) => saved && form.reset());
  }

  async function remove(rule: Rule) {
    const label = appNames.get(rule.target) ?? rule.target;
    if (!confirm(`Supprimer la règle sur « ${label} » ?`)) return;
    try {
      await ok(api.v1.devices[":id"].rules[":ruleId"].$delete({ param: { id: deviceId, ruleId: rule.id } }));
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // exeName undefined = every app.
  async function resetUsage(exeName?: string) {
    const label = exeName ? `« ${appNames.get(exeName) ?? exeName} »` : "toutes les applications";
    if (!confirm(`Remettre à zéro le temps d'aujourd'hui pour ${label} ?
L'historique du temps d'écran est conservé.`)) return;
    try {
      await ok(api.v1.devices[":id"]["usage-resets"].$post({ param: { id: deviceId }, json: { exeName } }));
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function changeLimit(rule: Rule, value: string) {
    const minutes = Number(value);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440 || minutes === rule.dailyLimitMinutes) return;
    void save(rule.target, "limit", minutes);
  }

  return (
    <div className="panel rules">
      <div className="panel-head">
        <h2>Règles</h2>
        {rules?.some((r) => r.mode === "limit") && (
          <button className="link" onClick={() => resetUsage()}>
            Tout remettre à zéro
          </button>
        )}
      </div>

      <form className="rule-form" onSubmit={onAdd}>
        <input name="target" list={`apps-${deviceId}`} placeholder="Application (ex. Minecraft)" required />
        <datalist id={`apps-${deviceId}`}>
          {apps.map((a) => (
            <option key={a.exeName} value={a.name}>
              {a.exeName}
            </option>
          ))}
        </datalist>
        <select value={mode} onChange={(e) => setMode(e.target.value as "limit" | "block")} aria-label="Type de règle">
          <option value="limit">Limiter</option>
          <option value="block">Bloquer</option>
        </select>
        {mode === "limit" && (
          <label className="rule-minutes">
            <input name="minutes" type="number" min={1} max={1440} defaultValue={60} required /> min/jour
          </label>
        )}
        <button>Ajouter</button>
      </form>

      {error && <p className="error">{error}</p>}

      {rules === null ? (
        <p className="muted">Chargement…</p>
      ) : rules.length === 0 ? (
        <p className="muted">Aucune règle. Choisis une application pour la limiter ou la bloquer.</p>
      ) : (
        <ul className="rule-list">
          {rules.map((rule) => {
            const used = rule.usedTodaySeconds;
            const limit = (rule.dailyLimitMinutes ?? 0) * 60;
            const over = rule.mode === "limit" && used >= limit;
            return (
              <li key={rule.id}>
                <div className="rule-app">
                  <strong>{appNames.get(rule.target) ?? rule.target}</strong>
                  <code>{rule.target}</code>
                </div>
                {rule.mode === "block" ? (
                  <span className="badge failed">Bloquée</span>
                ) : (
                  <div className="rule-limit">
                    <span className="st-track">
                      <span
                        className={`st-fill ${over ? "over" : ""}`}
                        style={{ width: `${Math.min(used / limit, 1) * 100}%` }}
                      />
                    </span>
                    <span className="rule-usage">
                      {formatDuration(used)} /{" "}
                      <input
                        type="number"
                        min={1}
                        max={1440}
                        defaultValue={rule.dailyLimitMinutes ?? 60}
                        aria-label="Minutes par jour"
                        onBlur={(e) => changeLimit(rule, e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                      />{" "}
                      min
                    </span>
                  </div>
                )}
                <div className="rule-actions">
                  {rule.mode === "limit" && (
                    <button className="link" onClick={() => resetUsage(rule.target)} title="Remettre à zéro le temps d'aujourd'hui">
                      Remettre à zéro
                    </button>
                  )}
                  <button className="link" onClick={() => remove(rule)}>
                    Supprimer
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
