import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

const PREFIX = 'enc:v1:';

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

function resolveKeyMaterial(): string {
  const key =
    process.env.TOTP_ENCRYPTION_KEY?.trim() || process.env.JWT_SECRET?.trim();
  if (!key) {
    throw new Error(
      'TOTP_ENCRYPTION_KEY or JWT_SECRET is required to encrypt secrets',
    );
  }
  return key;
}

/** Encrypt a TOTP secret at rest. Output is self-describing (`enc:v1:...`). */
export function encryptSecret(plainText: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    'aes-256-gcm',
    deriveKey(resolveKeyMaterial()),
    iv,
  );
  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

/**
 * Decrypt a value produced by encryptSecret.
 * Legacy plaintext secrets (no prefix) are returned as-is for migration.
 */
export function decryptSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) {
    return stored;
  }

  const rest = stored.slice(PREFIX.length);
  const [ivB64, tagB64, dataB64] = rest.split(':');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid encrypted secret format');
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    deriveKey(resolveKeyMaterial()),
    Buffer.from(ivB64, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
