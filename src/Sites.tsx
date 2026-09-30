import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ok } from "./lib/api";
import { REFRESH_MS } from "./ScreenTime";

type SiteRule = { id: string; type: "app" | "site"; target: string };

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

// Blocked websites. The API cleans what the parent types ("https://www.youtube.com/…"
// → "youtube.com/…"); a site blocks its subdomains too.
export default function Sites({ deviceId }: { deviceId: string }) {
  const [sites, setSites] = useState<SiteRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await ok(api.v1.devices[":id"].rules.$get({ param: { id: deviceId }, query: { tz } }));
      setSites(((await res.json()) as { rules: SiteRule[] }).rules.filter((r) => r.type === "site"));
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

  async function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const target = String(new FormData(form).get("target"));
    setError(null);
    try {
      await ok(api.v1.devices[":id"].rules.$put({ param: { id: deviceId }, json: { type: "site", target, mode: "block" } }));
      form.reset();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(site: SiteRule) {
    if (!confirm(`Débloquer « ${site.target} » ?`)) return;
    try {
      await ok(api.v1.devices[":id"].rules[":ruleId"].$delete({ param: { id: deviceId, ruleId: site.id } }));
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="panel rules">
      <h2>
        Sites bloqués {sites && sites.length > 0 && <span className="count">{sites.length}</span>}
      </h2>

      <form className="rule-form" onSubmit={onAdd}>
        <input name="target" placeholder="Site (ex. youtube.com)" required />
        <button>Bloquer</button>
      </form>

      {error && <p className="error">{error}</p>}

      {sites === null ? (
        <p className="muted">Chargement…</p>
      ) : sites.length === 0 ? (
        <p className="muted">Aucun site bloqué. Un site bloqué l'est aussi pour ses sous-domaines.</p>
      ) : (
        <ul className="rule-list site-list">
          {sites.map((site) => (
            <li key={site.id}>
              <div className="rule-app">
                <strong>{site.target}</strong>
              </div>
              <div className="rule-actions">
                <button className="link" onClick={() => remove(site)}>
                  Débloquer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
