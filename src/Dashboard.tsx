import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import DeviceDetail from "./DeviceDetail";
import { ConfirmButton } from "./components/ConfirmButton";
import { KeyCode } from "./components/KeyCode";
import { LanguageSwitch } from "./components/LanguageSwitch";
import { Loader } from "./components/Loader";
import { Button, Logo, StatusDot, Switch } from "./ds";
import { api, ok } from "./lib/api";
import { authClient } from "./lib/auth-client";
import { deviceStatus, type Device } from "./lib/device";
import { clockTime, longDate } from "./lib/format";
import { usePoll } from "./lib/poll";

type PairingCode = { code: string; expiresAt: string };

const DEVICE_HASH = /^#\/pc\/([0-9a-f-]{36})$/;

function useSelectedDevice() {
  const read = () => DEVICE_HASH.exec(location.hash)?.[1] ?? null;
  const [id, setId] = useState(read);
  useEffect(() => {
    const onChange = () => {
      setId(read());
      scrollTo({ top: 0 });
    };
    addEventListener("hashchange", onChange);
    return () => removeEventListener("hashchange", onChange);
  }, []);
  return id;
}

export default function Dashboard({ email, dark, onDark }: { email: string; dark: boolean; onDark: (dark: boolean) => void }) {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedId = useSelectedDevice();
  const selected = devices?.find((d) => d.id === selectedId);

  const load = useCallback(async () => {
    try {
      const res = await ok(api.v1.devices.$get());
      setDevices((await res.json()).devices);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  usePoll(load, 15_000);

  return (
    <div className="shell">
      <header className="topbar">
        <Logo size={34} animate href="#" />
        <div className="topbar__end">
          <LanguageSwitch />
          <Switch label={t("topbar.nightMode")} checked={dark} onChange={onDark} />
          <span className="topbar__account">
            <span className="topbar__email">{email}</span>
            <Button variant="ghost" size="sm" onClick={() => authClient.signOut()}>
              {t("topbar.signOut")}
            </Button>
          </span>
        </div>
      </header>

      <main key={selected ? selected.id : "list"} className="page-enter">
        {selected ? (
          <DeviceDetail device={selected} onRenamed={load} />
        ) : selectedId && devices === null ? (
          <Loader />
        ) : (
          <DeviceList devices={devices} error={error} reload={load} />
        )}
      </main>
    </div>
  );
}

function DeviceList({ devices, error, reload }: { devices: Device[] | null; error: string | null; reload: () => Promise<void> }) {
  const { t } = useTranslation();
  const [pairing, setPairing] = useState<PairingCode | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const count = useRef(devices?.length);

  // A new PC showing up means the code was used: put the code away.
  useEffect(() => {
    if (devices && count.current !== undefined && devices.length > count.current) setPairing(null);
    count.current = devices?.length;
  }, [devices]);

  async function addDevice() {
    setActionError(null);
    try {
      const res = await ok(api.v1["pairing-codes"].$post());
      setPairing(await res.json());
    } catch (e) {
      setActionError((e as Error).message);
    }
  }

  async function removeDevice(device: Device) {
    setActionError(null);
    try {
      await ok(api.v1.devices[":id"].$delete({ param: { id: device.id } }));
      await reload();
    } catch (e) {
      setActionError((e as Error).message);
    }
  }

  const empty = devices?.length === 0;

  return (
    <section className="devices" aria-labelledby="devices-title">
      <div className="devices__head">
        <h1 id="devices-title" className="page-title">
          {t("devices.title")}
        </h1>
        {!empty && !pairing && devices && <Button onClick={addDevice}>{t("devices.add")}</Button>}
      </div>

      {(error || actionError) && (
        <p className="form-error" role="alert">
          {actionError ?? error}
        </p>
      )}

      {pairing ? (
        <Pairing code={pairing} onRenew={addDevice} onClose={() => setPairing(null)} />
      ) : (
        empty && (
          <div className="devices__empty">
            <p className="lede">{t("devices.emptyTitle")}</p>
            <p className="muted">{t("devices.emptyText")}</p>
            <Button onClick={addDevice}>{t("devices.getCode")}</Button>
          </div>
        )
      )}

      {devices === null ? (
        !error && <Loader />
      ) : (
        <ul className="device-list">
          {devices.map((d, i) => {
            const { status, label } = deviceStatus(d);
            return (
              <li key={d.id} className="device-row" style={{ "--i": i } as CSSProperties}>
                <a className="device-row__link" href={`#/pc/${d.id}`}>
                  <span className="device-row__name">{d.name}</span>
                  <StatusDot status={status} label={label} />
                </a>
                <span className="device-row__meta">
                  {d.agentVersion && <>{t("common.agentVersion", { version: d.agentVersion })} · </>}
                  {t("common.addedOn", { date: longDate(new Date(d.createdAt)) })}
                </span>
                <ConfirmButton confirm={t("devices.confirmDelete", { name: d.name })} onConfirm={() => removeDevice(d)}>
                  {t("common.delete")}
                </ConfirmButton>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Pairing({ code, onRenew, onClose }: { code: PairingCode; onRenew: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);
  const expires = new Date(code.expiresAt);
  const expired = expires.getTime() <= now;

  return (
    <div className="pairing" aria-live="polite">
      {expired ? (
        <>
          <p className="lede">{t("pairing.expired")}</p>
          <div className="pairing__actions">
            <Button onClick={onRenew}>{t("pairing.renew")}</Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              {t("common.close")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="pairing__label">{t("pairing.label")}</p>
          <KeyCode code={code.code} />
          <p className="muted">{t("pairing.hint", { time: clockTime(expires) })}</p>
          <div className="pairing__actions">
            <Button variant="ghost" size="sm" onClick={onClose}>
              {t("common.close")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
