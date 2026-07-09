/**
 * Passphrase-based encryption for export files.
 *
 * Uses the Web Crypto API (available natively in Hermes ≥ RN 0.76):
 *   - PBKDF2 (600 000 iterations, SHA-256) to derive a 256-bit key
 *   - AES-256-GCM for authenticated encryption
 *
 * The encrypted envelope is a JSON object so it can be shared / picked
 * the same way as a plain export:
 *
 *   {
 *     "app": "backlog-tracker",
 *     "encrypted": true,
 *     "salt": "<base64, 16 bytes>",
 *     "iv":   "<base64, 12 bytes>",
 *     "data": "<base64, AES-GCM ciphertext + tag>"
 *   }
 */

// ---- helpers: Uint8Array ↔ base64 ----

function toBase64(bytes: Uint8Array): string {
  // chunk to avoid call-stack overflow on large arrays
  const chunks: string[] = [];
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
  }
  return btoa(chunks.join(""));
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ---- key derivation ----

const PBKDF2_ITERATIONS = 600_000;

async function deriveKey(
  passphrase: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// ---- public API ----

export interface EncryptedEnvelope {
  app: "backlog-tracker";
  encrypted: true;
  salt: string;
  iv: string;
  data: string;
}

/**
 * Encrypt a plain-text JSON export string with a passphrase.
 * Returns the encrypted envelope as a JSON string.
 */
export async function encryptExport(
  plainJson: string,
  passphrase: string
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);

  const enc = new TextEncoder();
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv.buffer as ArrayBuffer }, key, enc.encode(plainJson))
  );

  const envelope: EncryptedEnvelope = {
    app: "backlog-tracker",
    encrypted: true,
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(ciphertext),
  };
  return JSON.stringify(envelope, null, 2);
}

/**
 * Decrypt an encrypted envelope back to the plain-text JSON export.
 * Throws on wrong passphrase (AES-GCM auth tag verification fails).
 */
export async function decryptExport(
  envelopeJson: string,
  passphrase: string
): Promise<string> {
  const envelope = JSON.parse(envelopeJson);
  if (envelope.app !== "backlog-tracker" || !envelope.encrypted) {
    throw new Error("Not an encrypted backlog-tracker export");
  }
  const salt = fromBase64(envelope.salt);
  const iv = fromBase64(envelope.iv);
  const ciphertext = fromBase64(envelope.data);

  const key = await deriveKey(passphrase, salt);

  try {
    const plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext.buffer as ArrayBuffer
    );
    return new TextDecoder().decode(plainBuf);
  } catch {
    throw new Error("Decryption failed — wrong passphrase?");
  }
}

/** Quick check: does a parsed JSON object look like an encrypted envelope? */
export function isEncryptedEnvelope(obj: any): boolean {
  return obj?.app === "backlog-tracker" && obj?.encrypted === true;
}
