import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface EncryptedCredentialPayload {
  encryptedPayload: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

function credentialKey(): Buffer {
  const encoded = process.env.DESK_INTEGRATION_CREDENTIAL_KEY;
  if (!encoded) throw new Error('DESK_INTEGRATION_CREDENTIAL_KEY is required.');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) {
    throw new Error('DESK_INTEGRATION_CREDENTIAL_KEY must be a base64-encoded 32-byte key.');
  }
  return key;
}

function keyVersion(): number {
  const parsed = Number(process.env.DESK_INTEGRATION_CREDENTIAL_KEY_VERSION ?? '1');
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error('Invalid credential key version.');
  return parsed;
}

export function encryptCredentialPayload(payload: unknown, aad: string): EncryptedCredentialPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', credentialKey(), iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);

  return {
    encryptedPayload: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    keyVersion: keyVersion(),
  };
}

export function decryptCredentialPayload<T>(encrypted: EncryptedCredentialPayload, aad: string): T {
  const decipher = createDecipheriv('aes-256-gcm', credentialKey(), Buffer.from(encrypted.iv, 'base64'));
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.encryptedPayload, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  return JSON.parse(plaintext) as T;
}
