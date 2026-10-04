import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Loader } from "./components/Loader";
import { Button, Input, Key, Switch } from "./ds";
import { api, ok } from "./lib/api";
import { REFRESH_MS, tz } from "./lib/format";
import { usePoll } from "./lib/poll";

type SiteRule = { id: string; type: "app" | "site"; target: string };
type Youtube = "off" | "moderate" | "strict";
type FilterSettings = { safeSearch: boolean; youtube: Youtube };

const YOUTUBE: Youtube[] = ["off", "moderate", "strict"];

// Blocked sites and content filters: both act in the same browsers, so they share
// a section and a single note about which browsers that is.
export default function Web({ deviceId }: { deviceId: string }) {
  const { t } = useTranslation();
  return (
    <section className="block" aria-labelledby="web-title">
      <h2 id="web-title" className="block__title block__title--alone">
        {t("web.title")}
      </h2>
      <div className="web">
        <Sites deviceId={deviceId} />
        <Filters deviceId={deviceId} />
      </div>
      <p className="footnote web__note">
        {t("web.note")}
      </p>
    </section>
  );
}

// The API cleans what the parent types ("https://www.youtube.com/…" → "youtube.com/…");
// a site blocks its subdomains too.
function Sites({ deviceId }: { deviceId: string }) {
  const { t } = useTranslation();
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
          {t("web.sitesTitle")} {sites && sites.length > 0 && <span className="web__count">{sites.length}</span>}
        </h3>
        <p className="web__lede">{t("web.sitesLede")}</p>
      </div>
      <form className="control__inline" onSubmit={onAdd}>
        <Input name="target" placeholder="youtube.com" aria-label={t("web.siteAria")} required error={error ?? undefined} />
        <Button type="submit">{t("web.block")}</Button>
      </form>
      {sites === null ? (
        !error && <Loader />
      ) : sites.length === 0 ? (
        <p className="empty-line">{t("web.noSites")}</p>
      ) : (
        <ul className="sites">
          {sites.map((site) => (
            <li key={site.id} className="sites__row">
              <span className="sites__host">{site.target}</span>
              <Button variant="ghost" size="sm" onClick={() => remove(site)}>
                {t("web.unblock")}
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
  const { t } = useTranslation();
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
        <h3 className="web__title">{t("web.filtersTitle")}</h3>
        <p className="web__lede">{t("web.filtersLede")}</p>
      </div>
      {filters === null ? (
        error ? <p className="form-error">{error}</p> : <Loader />
      ) : (
        <div className="filters">
          <div className="filters__row">
            <div>
              <p className="filters__name">
                {t("web.safeSearch")}
              </p>
              <p className="filters__text">{t("web.safeSearchText")}</p>
            </div>
            <Switch checked={filters.safeSearch} onChange={(safeSearch) => save({ ...filters, safeSearch })} aria-label={t("web.safeSearch")} />
          </div>
          <div className="filters__row filters__row--stack">
            <div>
              <p className="filters__name">{t("web.youtube")}</p>
              <p className="filters__text">{t("web.youtubeText")}</p>
            </div>
            <div className="filters__keys" role="radiogroup" aria-label={t("web.youtubeAria")}>
              {YOUTUBE.map((value) => (
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
                  {t(`web.youtubeModes.${value}`)}
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
