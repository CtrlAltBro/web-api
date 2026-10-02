import { useCallback, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import type { App } from "./DeviceDetail";
import { ConfirmButton } from "./components/ConfirmButton";
import { Loader } from "./components/Loader";
import { Reveal } from "./components/Reveal";
import { Button, Input, Key, KeyTag } from "./ds";
import { api, ok } from "./lib/api";
import { REFRESH_MS, formatDuration, formatMinutes, tz } from "./lib/format";
import { usePoll } from "./lib/poll";

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

// Accepts an exe name, an app name from the inventory, or a bare name like "minecraft".
function toExeName(input: string, apps: App[]) {
  const value = input.trim().toLowerCase();
  const byName = apps.find((a) => a.name.toLowerCase() === value);
  if (byName) return byName.exeName;
  return value.endsWith(".exe") ? value : `${value}.exe`;
}

export default function Applications({ deviceId, apps }: { deviceId: string; apps: App[] | null }) {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [mode, setMode] = useState<"limit" | "block">("limit");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const targetRef = useRef<HTMLInputElement>(null);
  const appNames = useMemo(() => new Map((apps ?? []).map((a) => [a.exeName, a.name])), [apps]);
  const ruleFor = useMemo(() => new Map((rules ?? []).map((r) => [r.target, r])), [rules]);

  const load = useCallback(async () => {
    try {
      const res = await ok(api.v1.devices[":id"].rules.$get({ param: { id: deviceId }, query: { tz } }));
      setRules(((await res.json()) as { rules: Rule[] }).rules.filter((r) => r.type === "app"));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [deviceId]);

  usePoll(load, REFRESH_MS);

  async function act(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await load();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }

  const save = (exeName: string, ruleMode: "limit" | "block", minutes?: number) =>
    act(() =>
      ok(
        api.v1.devices[":id"].rules.$put({
          param: { id: deviceId },
          json:
            ruleMode === "block"
              ? { type: "app", target: exeName, mode: "block" }
              : { type: "app", target: exeName, mode: "limit", dailyLimitMinutes: minutes ?? 60 },
        }),
      ),
    );

  function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const minutes = Number(new FormData(e.currentTarget).get("minutes"));
    save(toExeName(target, apps ?? []), mode, minutes).then((saved) => saved && setTarget(""));
  }

  function onLimit(e: FormEvent<HTMLFormElement>, rule: Rule) {
    e.preventDefault();
    const minutes = Number(new FormData(e.currentTarget).get("minutes"));
    if (minutes === rule.dailyLimitMinutes) return setEditing(null);
    save(rule.target, "limit", minutes).then((saved) => saved && setEditing(null));
  }

  const remove = (rule: Rule) =>
    act(() => ok(api.v1.devices[":id"].rules[":ruleId"].$delete({ param: { id: deviceId, ruleId: rule.id } })));

  // exeName undefined = every app.
  const resetUsage = (exeName?: string) =>
    act(() => ok(api.v1.devices[":id"]["usage-resets"].$post({ param: { id: deviceId }, json: { exeName } })));

  function prefill(app: App) {
    setTarget(app.name);
    targetRef.current?.focus({ preventScroll: true });
    targetRef.current?.closest("form")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const label = (rule: Rule) => appNames.get(rule.target) ?? rule.target;

  return (
    <section className="block" aria-labelledby="apps-title">
      <div className="block__head">
        <h2 id="apps-title" className="block__title">
          Applications
        </h2>
        <p className="block__lede">
          Une application bloquée affiche un écran explicatif. Une copie renommée est reconnue et bloquée aussi.
        </p>
      </div>

      <form className="rule-form" onSubmit={onAdd}>
        <Input
          ref={targetRef}
          label="Application"
          placeholder="Minecraft, chrome.exe…"
          list={`apps-${deviceId}`}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          required
          className="rule-form__app"
        />
        <datalist id={`apps-${deviceId}`}>
          {(apps ?? []).map((a) => (
            <option key={a.exeName} value={a.name}>
              {a.exeName}
            </option>
          ))}
        </datalist>
        <div className="rule-form__mode" role="radiogroup" aria-label="Type de règle">
          {(["limit", "block"] as const).map((m) => (
            <Key
              key={m}
              tone={mode === m ? "violet" : "cream"}
              size="sm"
              pressable
              pressed={mode === m}
              onClick={() => setMode(m)}
              role="radio"
              aria-checked={mode === m}
            >
              {m === "limit" ? "Limiter" : "Bloquer"}
            </Key>
          ))}
        </div>
        {mode === "limit" && (
          <Input label="Par jour" name="minutes" type="number" min={1} max={1440} defaultValue={60} suffix="min" required className="rule-form__minutes" />
        )}
        <Button type="submit">Ajouter la règle</Button>
      </form>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {rules === null ? (
        !error && <Loader />
      ) : rules.length === 0 ? (
        <p className="empty-line">Aucune règle pour l'instant : toutes les applications sont libres, dans la limite des horaires.</p>
      ) : (
        <>
          <ul className="rules">
            {rules.map((rule, i) => {
              const limit = (rule.dailyLimitMinutes ?? 0) * 60;
              const over = rule.mode === "limit" && rule.usedTodaySeconds >= limit;
              return (
                <li key={rule.id} className="rule" style={{ "--i": i } as CSSProperties}>
                  <div className="rule__app">
                    <span className="rule__name">{label(rule)}</span>
                    <span className="rule__exe">{rule.target}</span>
                  </div>
                  {rule.mode === "block" ? (
                    <KeyTag status="alert">Bloquée</KeyTag>
                  ) : editing === rule.id ? (
                    <form className="rule__edit" onSubmit={(e) => onLimit(e, rule)}>
                      <Input
                        name="minutes"
                        type="number"
                        min={1}
                        max={1440}
                        defaultValue={rule.dailyLimitMinutes ?? 60}
                        suffix="min / jour"
                        aria-label={`Limite quotidienne pour ${label(rule)}`}
                        autoFocus
                        onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                      />
                      <Button type="submit" variant="secondary" size="sm">
                        OK
                      </Button>
                    </form>
                  ) : (
                    <div className="rule__limit">
                      <KeyTag status={over ? "alert" : undefined}>{formatMinutes(rule.dailyLimitMinutes ?? 0)} / jour</KeyTag>
                      <span className="rule__used" data-over={over}>
                        {over ? "Limite atteinte" : `${formatDuration(rule.usedTodaySeconds)} aujourd'hui`}
                      </span>
                    </div>
                  )}
                  <div className="rule__actions">
                    {rule.mode === "limit" && editing !== rule.id && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => setEditing(rule.id)}>
                          Modifier
                        </Button>
                        {rule.usedTodaySeconds > 0 && (
                          <ConfirmButton confirm="Remettre à zéro ?" onConfirm={() => resetUsage(rule.target)}>
                            Remettre à zéro
                          </ConfirmButton>
                        )}
                      </>
                    )}
                    <ConfirmButton confirm="Supprimer ?" onConfirm={() => remove(rule)}>
                      Supprimer
                    </ConfirmButton>
                  </div>
                </li>
              );
            })}
          </ul>
          {rules.filter((r) => r.mode === "limit" && r.usedTodaySeconds > 0).length > 1 && (
            <div className="rules__footer">
              <ConfirmButton confirm="Remettre tout le temps d'aujourd'hui à zéro ?" onConfirm={() => resetUsage()}>
                Tout remettre à zéro
              </ConfirmButton>
              <span className="muted">L'historique du temps d'écran est conservé.</span>
            </div>
          )}
        </>
      )}

      <div className="inventory">
        {apps === null ? null : apps.length === 0 ? (
          <p className="empty-line">L'agent n'a pas encore envoyé la liste des applications installées.</p>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={() => setInventoryOpen(!inventoryOpen)} aria-expanded={inventoryOpen}>
              {inventoryOpen ? "Masquer les" : "Voir les"} {apps.length} applications installées
            </Button>
            <Reveal open={inventoryOpen}>
              <ul className="inventory__list">
                {apps.map((a) => {
                  const rule = ruleFor.get(a.exeName);
                  return (
                    <li key={a.exeName} className="inventory__app" title={a.path ?? undefined}>
                      <span className="inventory__name">{a.name}</span>
                      <span className="inventory__exe">{a.exeName}</span>
                      {rule ? (
                        <span className="inventory__rule">
                          {rule.mode === "block" ? "Bloquée" : `${formatMinutes(rule.dailyLimitMinutes ?? 0)} / jour`}
                        </span>
                      ) : (
                        <button className="text-action" onClick={() => prefill(a)} aria-label={`Créer une règle pour ${a.name}`}>
                          Règle
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Reveal>
          </>
        )}
      </div>
    </section>
  );
}
