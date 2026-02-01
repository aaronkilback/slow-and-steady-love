/**
 * Signal-style E2E Encryption using libsodium
 * 
 * This implements:
 * - X25519 key exchange (Curve25519)
 * - XSalsa20-Poly1305 authenticated encryption
 * - Argon2id for password-based key derivation
 * 
 * The server never sees plaintext messages or private keys.
 */

import _sodium from "libsodium-wrappers";

let sodium: typeof _sodium;

// Initialize libsodium
export async function initializeEncryption(): Promise<void> {
  await _sodium.ready;
  sodium = _sodium;
}

// Ensure sodium is ready
async function ensureSodium() {
  if (!sodium) {
    await initializeEncryption();
  }
  return sodium;
}

/**
 * Generate a random salt for key derivation
 */
export async function generateSalt(): Promise<string> {
  const s = await ensureSodium();
  const salt = s.randombytes_buf(s.crypto_pwhash_SALTBYTES);
  return s.to_base64(salt, s.base64_variants.ORIGINAL);
}

/**
 * Derive a seed from password using Argon2id
 * This seed is used to generate the key pair deterministically
 */
async function deriveKeyFromPassword(password: string, saltBase64: string): Promise<Uint8Array> {
  const s = await ensureSodium();
  const salt = s.from_base64(saltBase64, s.base64_variants.ORIGINAL);
  
  // Use Argon2id with strong parameters
  const seed = s.crypto_pwhash(
    s.crypto_box_SEEDBYTES,
    password,
    salt,
    s.crypto_pwhash_OPSLIMIT_MODERATE,
    s.crypto_pwhash_MEMLIMIT_MODERATE,
    s.crypto_pwhash_ALG_ARGON2ID13
  );
  
  return seed;
}

/**
 * Generate X25519 key pair from password
 * Returns the same key pair for the same password + salt combination
 */
export async function generateKeyPairFromPassword(
  password: string, 
  saltBase64: string
): Promise<{ publicKey: string; privateKey: Uint8Array }> {
  const s = await ensureSodium();
  const seed = await deriveKeyFromPassword(password, saltBase64);
  
  // Generate deterministic key pair from seed
  const keyPair = s.crypto_box_seed_keypair(seed);
  
  return {
    publicKey: s.to_base64(keyPair.publicKey, s.base64_variants.ORIGINAL),
    privateKey: keyPair.privateKey,
  };
}

/**
 * Encrypt a message for a recipient using their public key
 * Uses X25519 key exchange + XSalsa20-Poly1305
 */
export async function encryptMessage(
  plaintext: string,
  recipientPublicKeyBase64: string,
  senderPrivateKey: Uint8Array
): Promise<{ ciphertext: string; nonce: string }> {
  const s = await ensureSodium();
  
  const recipientPublicKey = s.from_base64(recipientPublicKeyBase64, s.base64_variants.ORIGINAL);
  const nonce = s.randombytes_buf(s.crypto_box_NONCEBYTES);
  
  const ciphertext = s.crypto_box_easy(
    plaintext,
    nonce,
    recipientPublicKey,
    senderPrivateKey
  );
  
  return {
    ciphertext: s.to_base64(ciphertext, s.base64_variants.ORIGINAL),
    nonce: s.to_base64(nonce, s.base64_variants.ORIGINAL),
  };
}

/**
 * Decrypt a message from a sender using their public key
 */
export async function decryptMessage(
  ciphertextBase64: string,
  nonceBase64: string,
  senderPublicKeyBase64: string,
  recipientPrivateKey: Uint8Array
): Promise<string> {
  const s = await ensureSodium();
  
  const ciphertext = s.from_base64(ciphertextBase64, s.base64_variants.ORIGINAL);
  const nonce = s.from_base64(nonceBase64, s.base64_variants.ORIGINAL);
  const senderPublicKey = s.from_base64(senderPublicKeyBase64, s.base64_variants.ORIGINAL);
  
  const plaintext = s.crypto_box_open_easy(
    ciphertext,
    nonce,
    senderPublicKey,
    recipientPrivateKey
  );
  
  return s.to_string(plaintext);
}

/**
 * Encrypt private key for local storage using a derived key from password
 */
export async function encryptPrivateKeyForStorage(
  privateKey: Uint8Array,
  password: string,
  saltBase64: string
): Promise<string> {
  const s = await ensureSodium();
  const salt = s.from_base64(saltBase64, s.base64_variants.ORIGINAL);
  
  // Derive a symmetric key for local storage encryption
  const key = s.crypto_pwhash(
    s.crypto_secretbox_KEYBYTES,
    password,
    salt,
    s.crypto_pwhash_OPSLIMIT_MODERATE,
    s.crypto_pwhash_MEMLIMIT_MODERATE,
    s.crypto_pwhash_ALG_ARGON2ID13
  );
  
  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES);
  const ciphertext = s.crypto_secretbox_easy(privateKey, nonce, key);
  
  // Combine nonce + ciphertext
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce);
  combined.set(ciphertext, nonce.length);
  
  return s.to_base64(combined, s.base64_variants.ORIGINAL);
}

/**
 * Decrypt private key from local storage
 */
export async function decryptPrivateKeyFromStorage(
  encryptedBase64: string,
  password: string,
  saltBase64: string
): Promise<Uint8Array> {
  const s = await ensureSodium();
  const salt = s.from_base64(saltBase64, s.base64_variants.ORIGINAL);
  
  // Derive the same symmetric key
  const key = s.crypto_pwhash(
    s.crypto_secretbox_KEYBYTES,
    password,
    salt,
    s.crypto_pwhash_OPSLIMIT_MODERATE,
    s.crypto_pwhash_MEMLIMIT_MODERATE,
    s.crypto_pwhash_ALG_ARGON2ID13
  );
  
  const combined = s.from_base64(encryptedBase64, s.base64_variants.ORIGINAL);
  const nonce = combined.slice(0, s.crypto_secretbox_NONCEBYTES);
  const ciphertext = combined.slice(s.crypto_secretbox_NONCEBYTES);
  
  return s.crypto_secretbox_open_easy(ciphertext, nonce, key);
}

/**
 * Store encrypted private key in localStorage
 */
export function storeEncryptedPrivateKey(userId: string, encryptedKey: string): void {
  localStorage.setItem(`fortress_e2e_key_${userId}`, encryptedKey);
}

/**
 * Retrieve encrypted private key from localStorage
 */
export function getStoredEncryptedPrivateKey(userId: string): string | null {
  return localStorage.getItem(`fortress_e2e_key_${userId}`);
}

/**
 * Store salt locally (also stored in DB for recovery)
 */
export function storeKeySalt(userId: string, salt: string): void {
  localStorage.setItem(`fortress_e2e_salt_${userId}`, salt);
}

/**
 * Get stored salt
 */
export function getStoredKeySalt(userId: string): string | null {
  return localStorage.getItem(`fortress_e2e_salt_${userId}`);
}

/**
 * Clear all encryption data (for logout)
 */
export function clearEncryptionData(userId: string): void {
  localStorage.removeItem(`fortress_e2e_key_${userId}`);
  localStorage.removeItem(`fortress_e2e_salt_${userId}`);
}
