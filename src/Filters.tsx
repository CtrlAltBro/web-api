import { useCallback, useEffect, useState } from "react";
import { api, ok } from "./lib/api";

type Youtube = "off" | "moderate" | "strict";
type FilterSettings = { safeSearch: boolean; youtube: Youtube };

// Content filters forced in the child's browsers (Edge, Chrome, Brave, Vivaldi).
export default function Filters({ deviceId }: { deviceId: string }) {
  const [filters, setFilters] = useState<FilterSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await ok(api.v1.devices[":id"].filters.$get({ param: { id: deviceId } }));
      setFilters(((await res.json()) as { filters: FilterSettings }).filters);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [deviceId]);

  useEffect(() => {
    load();
  }, [load]);

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
    <div className="panel">
      <h2>Filtrage</h2>
      {error && <p className="error">{error}</p>}
      {filters === null ? (
        <p className="muted">Chargement…</p>
      ) : (
        <div className="filters">
          <label className="filter-row">
            <input
              type="checkbox"
              checked={filters.safeSearch}
              onChange={(e) => save({ ...filters, safeSearch: e.target.checked })}
            />
            <span>
              <strong>Recherche sécurisée</strong>
              <small>
                Google et Bing masquent les résultats et images pour adultes. Les moteurs où ce filtre ne peut pas être
                imposé (DuckDuckGo, Brave Search, Qwant, Ecosia…) sont bloqués.
              </small>
            </span>
          </label>
          <label className="filter-row">
            <select value={filters.youtube} onChange={(e) => save({ ...filters, youtube: e.target.value as Youtube })}>
              <option value="off">Normal</option>
              <option value="moderate">Restreint (modéré)</option>
              <option value="strict">Restreint (strict)</option>
            </select>
            <span>
              <strong>YouTube</strong>
              <small>Le mode restreint masque les vidéos signalées pour adultes ; le strict en masque davantage.</small>
            </span>
          </label>
          <p className="muted">
            Appliqué dans Edge, Chrome, Brave et Vivaldi, sans que l'enfant puisse le désactiver. Les navigateurs qui ne le
            permettent pas (Firefox, Opera…) sont bloqués tant qu'un filtre est actif.
          </p>
        </div>
      )}
    </div>
  );
}
