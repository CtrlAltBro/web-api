import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Loader } from "./components/Loader";
import { Button, Input, Key, Switch } from "./ds";
import { api, ok } from "./lib/api";
import { REFRESH_MS, tz } from "./lib/format";
import { usePoll } from "./lib/poll";

type SiteRule = { id: string; type: "app" | "site"; target: string };
type Youtube = "off" | "moderate" | "strict";
type FilterSettings = { safeSearch: boolean; youtube: Youtube };

const YOUTUBE: { value: Youtube; label: string }[] = [
  { value: "off", label: "Normal" },
  { value: "moderate", label: "Restreint" },
  { value: "strict", label: "Restreint strict" },
];

// Blocked sites and content filters: both act in the same browsers, so they share
// a section and a single note about which browsers that is.
export default function Web({ deviceId }: { deviceId: string }) {
  return (
    <section className="block" aria-labelledby="web-title">
      <h2 id="web-title" className="block__title block__title--alone">
        Sites et recherche
      </h2>
      <div className="web">
        <Sites deviceId={deviceId} />
        <Filters deviceId={deviceId} />
      </div>
      <p className="footnote web__note">
        Sites et filtres s'appliquent dans Edge, Chrome, Brave et Vivaldi. Les navigateurs qui ne le permettent pas (Firefox,
        Opera, Tor Browser…) sont bloqués tant qu'un site ou un filtre est actif. Une règle posée sur un navigateur dans
        Applications passe avant.
      </p>
    </section>
  );
}

// The API cleans what the parent types ("https://www.youtube.com/…" → "youtube.com/…");
// a site blocks its subdomains too.
function Sites({ deviceId }: { deviceId: string }) {
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

  usePoll(load, REFRESH_MS);

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
    setError(null);
    try {
      await ok(api.v1.devices[":id"].rules[":ruleId"].$delete({ param: { id: deviceId, ruleId: site.id } }));
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="web__col">
      <div>
        <h3 className="web__title">
          Sites bloqués {sites && sites.length > 0 && <span className="web__count">{sites.length}</span>}
        </h3>
        <p className="web__lede">Le site et toutes ses pages sont inaccessibles, sous-domaines compris.</p>
      </div>
      <form className="control__inline" onSubmit={onAdd}>
        <Input name="target" placeholder="youtube.com" aria-label="Site à bloquer" required error={error ?? undefined} />
        <Button type="submit">Bloquer</Button>
      </form>
      {sites === null ? (
        !error && <Loader />
      ) : sites.length === 0 ? (
        <p className="empty-line">Aucun site bloqué.</p>
      ) : (
        <ul className="sites">
          {sites.map((site) => (
            <li key={site.id} className="sites__row">
              <span className="sites__host">{site.target}</span>
              <Button variant="ghost" size="sm" onClick={() => remove(site)}>
                Débloquer
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Forced in the child's browsers, without a way to turn them off there.
function Filters({ deviceId }: { deviceId: string }) {
  const [filters, setFilters] = useState<FilterSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ok(api.v1.devices[":id"].filters.$get({ param: { id: deviceId } }))
      .then((res) => res.json() as Promise<{ filters: FilterSettings }>)
      .then((body) => setFilters(body.filters))
      .catch((e: Error) => setError(e.message));
  }, [deviceId]);

  async function save(next: FilterSettings) {
    const previous = filters;
    setFilters(next);
    setError(null);
    try {
      await ok(api.v1.devices[":id"].filters.$put({ param: { id: deviceId }, json: next }));
    } catch (e) {
      setFilters(previous);
      setError((e as Error).message);
    }
  }

  return (
    <div className="web__col">
      <div>
        <h3 className="web__title">Filtres</h3>
        <p className="web__lede">Imposés dans le navigateur : l'enfant ne peut pas les désactiver.</p>
      </div>
      {filters === null ? (
        error ? <p className="form-error">{error}</p> : <Loader />
      ) : (
        <div className="filters">
          <div className="filters__row">
            <div>
              <p className="filters__name">
                Recherche sécurisée
              </p>
              <p className="filters__text">
                Google et Bing masquent les résultats et images pour adultes. Les moteurs où ce filtre ne peut pas être
                imposé (DuckDuckGo, Brave Search, Qwant, Ecosia…) sont bloqués.
              </p>
            </div>
            <Switch checked={filters.safeSearch} onChange={(safeSearch) => save({ ...filters, safeSearch })} aria-label="Recherche sécurisée" />
          </div>
          <div className="filters__row filters__row--stack">
            <div>
              <p className="filters__name">YouTube</p>
              <p className="filters__text">Le mode restreint masque les vidéos signalées pour adultes ; le strict en masque davantage.</p>
            </div>
            <div className="filters__keys" role="radiogroup" aria-label="Mode YouTube">
              {YOUTUBE.map(({ value, label }) => (
                <Key
                  key={value}
                  tone={filters.youtube === value ? "violet" : "cream"}
                  size="sm"
                  pressable
                  pressed={filters.youtube === value}
                  onClick={() => filters.youtube !== value && save({ ...filters, youtube: value })}
                  role="radio"
                  aria-checked={filters.youtube === value}
                >
                  {label}
                </Key>
              ))}
            </div>
          </div>
          {error && <p className="form-error filters__error">{error}</p>}
        </div>
      )}
    </div>
  );
}
