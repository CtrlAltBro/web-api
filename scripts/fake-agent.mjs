// Stand-in for the desktop agent, to exercise /api/agent/v1 without Electron.
//
//   node scripts/fake-agent.mjs pair K7QM-3XRD "PC de test"
//   node scripts/fake-agent.mjs sync
//
// State (device token, rules version, pending command results) is kept in
// .fake-agent.json. API_URL defaults to http://localhost:5173.
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const API_URL = process.env.API_URL ?? "http://localhost:5173";
const STATE_FILE = new URL("../.fake-agent.json", import.meta.url);

const loadState = () => (existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : null);
const saveState = (state) => writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

async function call(path, body, token) {
  const res = await fetch(`${API_URL}/api/agent/v1${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(data)}`);
  return data;
}

const [command, ...args] = process.argv.slice(2);

if (command === "pair") {
  const [code, name = "PC de test"] = args;
  if (!code) throw new Error("usage: pair <code> [name]");
  const { deviceId, token } = await call("/pair", { code, name });
  saveState({ deviceId, token, rulesVersion: -1, inventorySent: false, commandResults: [] });
  console.log(`paired as device ${deviceId}`);
} else if (command === "sync") {
  const state = loadState();
  if (!state) throw new Error("not paired: run `pair <code>` first");

  const now = Date.now();
  const body = {
    agentVersion: "fake-0.1.0",
    rulesVersion: state.rulesVersion,
    // Inventory only on the first sync, like the real agent (only when it changed).
    ...(!state.inventorySent && {
      apps: [
        { exeName: "discord.exe", name: "Discord", path: "C:\\Users\\bro\\AppData\\Local\\Discord\\app\\Discord.exe" },
        { exeName: "FortniteClient-Win64-Shipping.exe", name: "Fortnite" },
        { exeName: "msedge.exe", name: "Microsoft Edge" },
      ],
    }),
    screenTime: [
      {
        id: randomUUID(),
        app: "Discord",
        exeName: "discord.exe",
        title: "#général",
        startedAt: new Date(now - 10 * 60_000).toISOString(),
        endedAt: new Date(now - 4 * 60_000).toISOString(),
      },
      {
        id: randomUUID(),
        app: "Microsoft Edge",
        exeName: "msedge.exe",
        title: "YouTube",
        startedAt: new Date(now - 4 * 60_000).toISOString(),
        endedAt: new Date(now).toISOString(),
      },
    ],
    history: [
      { id: randomUUID(), browser: "edge", url: "https://www.youtube.com/", title: "YouTube", visitedAt: new Date(now - 60_000).toISOString() },
    ],
    commandResults: state.commandResults,
  };

  const res = await call("/sync", body, state.token);
  console.log(JSON.stringify(res, null, 2));

  saveState({
    ...state,
    inventorySent: true,
    rulesVersion: res.rules?.version ?? state.rulesVersion,
    // Pretend every received command ran fine; reported on the next sync.
    commandResults: res.commands.map((c) => ({ id: c.id, status: "done" })),
  });
} else {
  console.log("usage: fake-agent.mjs pair <code> [name] | sync");
}
