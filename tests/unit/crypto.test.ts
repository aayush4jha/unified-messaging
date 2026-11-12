import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptJSON, encryptJSON, signState, verifyState } from "@/server/crypto";

const key = randomBytes(32);
const secret = Buffer.from("test-state-secret");

describe("token encryption", () => {
  it("round-trips JSON", () => {
    const tokens = { accessToken: "ya29.abc", refreshToken: "1//xyz", expiresAt: 123 };
    const ct = encryptJSON(tokens, key);
    expect(ct.startsWith("v1.")).toBe(true);
    expect(ct).not.toContain("ya29");
    expect(decryptJSON(ct, key)).toEqual(tokens);
  });
  it("uses a fresh IV every time", () => {
    expect(encryptJSON({ a: 1 }, key)).not.toBe(encryptJSON({ a: 1 }, key));
  });
  it("rejects tampered ciphertext", () => {
    const ct = encryptJSON({ a: 1 }, key);
    const parts = ct.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptJSON(parts.join("."), key)).toThrow();
  });
  it("rejects the wrong key", () => {
    expect(() => decryptJSON(encryptJSON({ a: 1 }, key), randomBytes(32))).toThrow();
  });
});

describe("OAuth state", () => {
  const base = { userId: "u1", platform: "gmail", nonce: "n1", exp: Date.now() + 60_000 };
  it("verifies a valid state bound to the nonce", () => {
    expect(verifyState(signState(base, secret), "n1", secret).userId).toBe("u1");
  });
  it("rejects a mismatched nonce (CSRF / different browser)", () => {
    expect(() => verifyState(signState(base, secret), "other", secret)).toThrow(/nonce/);
  });
  it("rejects expired state", () => {
    expect(() => verifyState(signState({ ...base, exp: Date.now() - 1 }, secret), "n1", secret)).toThrow(/expired/);
  });
  it("rejects a forged payload", () => {
    const [, sig] = signState(base, secret).split(".");
    const forged = Buffer.from(JSON.stringify({ ...base, userId: "attacker" })).toString("base64url");
    expect(() => verifyState(`${forged}.${sig}`, "n1", secret)).toThrow(/signature/);
  });
});
