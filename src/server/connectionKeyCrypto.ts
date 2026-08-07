import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

function key(): Buffer {
  const raw = process.env["INTEGRATION_ENCRYPTION_KEY"] ?? process.env.APP_USER_CONNECTION_KEY_SECRET;
  if (!raw) throw new Error("INTEGRATION_ENCRYPTION_KEY is not set");
  // Support both base64 (32 bytes) and arbitrary-length strings via SHA-256.
  try {
    const b = Buffer.from(raw, "base64");
    if (b.length === 32) return b;
  } catch {}
  return createHash("sha256").update(raw).digest();
}

export function encryptConnectionKey(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptConnectionKey(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
