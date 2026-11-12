import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Token encryption at rest: AES-256-GCM with a 32-byte key from
 * ORBIT_TOKEN_ENCRYPTION_KEY (base64). Output format: v1.<iv>.<tag>.<ciphertext>
 * (all base64url). Generate a key with: openssl rand -base64 32
 */
function key(): Buffer {
  const raw = process.env.ORBIT_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("ORBIT_TOKEN_ENCRYPTION_KEY is not set");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("ORBIT_TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return k;
}

export function encryptJSON(value: unknown, k: Buffer = key()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptJSON<T>(payload: string, k: Buffer = key()): T {
  const [v, iv, tag, ct] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unrecognized token ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const pt = Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]);
  return JSON.parse(pt.toString("utf8")) as T;
}

/* ------------------------------------------------------------------ signed OAuth state */

export interface OAuthState {
  userId: string;
  platform: string;
  nonce: string;
  exp: number; // epoch ms
  reconnectAccountId?: string;
}

function stateSecret(): Buffer {
  const raw = process.env.ORBIT_STATE_SECRET || process.env.ORBIT_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("ORBIT_STATE_SECRET (or ORBIT_TOKEN_ENCRYPTION_KEY) is not set");
  return Buffer.from(raw);
}

export function signState(state: OAuthState, secret: Buffer = stateSecret()): string {
  const body = Buffer.from(JSON.stringify(state)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** Verifies signature, expiry and that the nonce matches the one bound to the browser cookie. */
export function verifyState(token: string, expectedNonce: string | undefined, secret: Buffer = stateSecret(), now = Date.now()): OAuthState {
  const [body, sig] = token.split(".");
  if (!body || !sig) throw new Error("Malformed state");
  const expected = createHmac("sha256", secret).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new Error("Invalid state signature");
  const state = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthState;
  if (state.exp < now) throw new Error("State expired");
  if (!expectedNonce || state.nonce !== expectedNonce) throw new Error("State nonce mismatch");
  return state;
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
