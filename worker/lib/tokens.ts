const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newPairingCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % 32]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

export function normalizePairingCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function newDeviceToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `cab_${btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}