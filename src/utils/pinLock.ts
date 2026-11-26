export const LOCK_PIN_LIMITS = {
  MIN_LENGTH: 4,
  MAX_LENGTH: 6,
  SALT_MAX: 64,
  HASH_MAX: 128,
} as const;

export const LOCK_TIMEOUT_OPTIONS = [
  { value: 60, label: '1 dəqiqə' },
  { value: 180, label: '3 dəqiqə' },
  { value: 300, label: '5 dəqiqə' },
  { value: 600, label: '10 dəqiqə' },
  { value: 900, label: '15 dəqiqə' },
] as const;

export function isValidPinFormat(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

export function generatePinSalt(): string {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derivedBits = await window.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: 10000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return bytesToHex(new Uint8Array(derivedBits));
}

export async function verifyPin(
  pin: string,
  salt: string,
  expectedHash: string
): Promise<boolean> {
  if (!pin || !salt || !expectedHash) return false;
  const computed = await hashPin(pin, salt);
  if (computed.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  return diff === 0;
}

export function formatTimeoutLabel(seconds: number): string {
  const found = LOCK_TIMEOUT_OPTIONS.find((opt) => opt.value === seconds);
  if (found) return found.label;
  if (seconds < 60) return `${seconds} san`;
  const mins = Math.round(seconds / 60);
  return `${mins} dəqiqə`;
}
