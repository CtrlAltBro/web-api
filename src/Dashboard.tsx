import { useCallback, useEffect, useState } from "react";
import DeviceDetail from "./DeviceDetail";
import { api, ok } from "./lib/api";
import { authClient } from "./lib/auth-client";
import { isOnline, statusLabel, type Device } from "./lib/device";

type PairingCode = { code: string; expiresAt: string };

const DEVICE_HASH = /^#\/pc\/([0-9a-f-]{36})$/;

function useSelectedDevice() {
  const read = () => DEVICE_HASH.exec(location.hash)?.[1] ?? null;
  const [id, setId] = useState(read);
  useEffect(() => {
    const onChange = () => setId(read());
    addEventListener("hashchange", onChange);
    return () => removeEventListener("hashchange", onChange);
  }, []);
  return id;
}

export default function Dashboard({ email }: { email: string }) {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [pairing, setPairing] = useState<PairingCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedId = useSelectedDevice();
  const selected = devices?.find((d) => d.id === selectedId);

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
        <a className="logo" href="#">
          <kbd>Ctrl</kbd>
          <kbd>Alt</kbd>
          <kbd className="accent">Bro</kbd>
        </a>
        <span className="muted">
          {email} · <button className="link" onClick={() => authClient.signOut()}>Se déconnecter</button>
        </span>
      </header>

      {selected ? (
        <DeviceDetail key={selected.id} device={selected} onBack={() => (location.hash = "")} />
      ) : selectedId && devices === null ? (
        <p className="muted">Chargement…</p>
      ) : (
        <section>
          <div className="row">
            <h1>Mes PC</h1>
            <button onClick={addDevice}>Ajouter un PC</button>
          </div>

          {pairing && (
            <p className="notice">
              Code d'appairage à saisir dans l'agent : <code className="code">{pairing.code}</code> valable jusqu'à{" "}
              {new Date(pairing.expiresAt).toLocaleTimeString()}.
            </p>
          )}
          {error && <p className="error">{error}</p>}

          {devices === null ? (
            <p className="muted">Chargement…</p>
          ) : devices.length === 0 ? (
            <p className="muted">Aucun PC pour l'instant. Clique sur « Ajouter un PC » puis saisis le code dans l'agent.</p>
          ) : (
            <ul className="devices">
              {devices.map((d) => (
                <li key={d.id}>
                  <a href={`#/pc/${d.id}`}>
                    <span className={`dot ${isOnline(d) ? "on" : ""}`} />
                    <span>
                      <strong>{d.name}</strong>
                      <small>{statusLabel(d)}</small>
                    </span>
                  </a>
                  <button className="link" onClick={() => removeDevice(d)}>
                    Supprimer
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
