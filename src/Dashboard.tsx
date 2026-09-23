import { useCallback, useEffect, useState } from "react";
import { api, ok } from "./lib/api";
import { authClient } from "./lib/auth-client";

type Device = { id: string; name: string; agentVersion: string | null; createdAt: string; lastSeenAt: string | null };
type PairingCode = { code: string; expiresAt: string };

const ONLINE_THRESHOLD_MS = 60_000;

export default function Dashboard({ email }: { email: string }) {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [pairing, setPairing] = useState<PairingCode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await ok(api.v1.devices.$get());
      setDevices((await res.json()).devices);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, [load]);

  async function addDevice() {
    setError(null);
    try {
      const res = await ok(api.v1["pairing-codes"].$post());
      setPairing(await res.json());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removeDevice(device: Device) {
    if (!confirm(`Supprimer « ${device.name} » et toutes ses données ?`)) return;
    try {
      await ok(api.v1.devices[":id"].$delete({ param: { id: device.id } }));
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <main className="page">
      <header>
        <strong>CtrlAltBro</strong>
        <span>
          {email} · <button className="link" onClick={() => authClient.signOut()}>Se déconnecter</button>
        </span>
      </header>

      <section>
        <div className="row">
          <h1>Mes PC</h1>
          <button onClick={addDevice}>Ajouter un PC</button>
        </div>

        {pairing && (
          <p className="notice">
            Code d'appairage à saisir dans l'agent : <code>{pairing.code}</code> — valable jusqu'à{" "}
            {new Date(pairing.expiresAt).toLocaleTimeString()}.
          </p>
        )}
        {error && <p className="error">{error}</p>}

        {devices === null ? (
          <p>Chargement…</p>
        ) : devices.length === 0 ? (
          <p>Aucun PC pour l'instant. Clique sur « Ajouter un PC » puis saisis le code dans l'agent.</p>
        ) : (
          <ul className="devices">
            {devices.map((d) => (
              <li key={d.id}>
                <div>
                  <strong>{d.name}</strong>
                  <small>{status(d)}</small>
                </div>
                <button className="link" onClick={() => removeDevice(d)}>
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function status(d: Device) {
  if (!d.lastSeenAt) return "jamais connecté";
  const last = new Date(d.lastSeenAt);
  if (Date.now() - last.getTime() < ONLINE_THRESHOLD_MS) return "en ligne";
  return `vu le ${last.toLocaleString()}`;
}
