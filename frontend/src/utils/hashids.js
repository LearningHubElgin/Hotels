import Hashids from 'hashids';

// A secure salt and minimum length for clean, professional, obfuscated URLs
const SALT = 'hotel_superadmin_secure_salt_2026';
const MIN_LENGTH = 8;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';

const hashids = new Hashids(SALT, MIN_LENGTH, ALPHABET);

/**
 * Encodes a numeric ID to a secure Hashids string (e.g., 2 -> "k8X2mP9A")
 * If input is already a non-numeric string or empty, handles gracefully.
 */
export const encodeId = (id) => {
  if (id === undefined || id === null || id === '') return '';
  const num = Number(id);
  if (isNaN(num)) return String(id);
  return hashids.encode(num);
};

/**
 * Decodes a Hashids string back to numeric ID (e.g., "k8X2mP9A" -> 2)
 * Supports legacy plain numeric IDs as fallback.
 */
export const decodeId = (hash) => {
  if (hash === undefined || hash === null || hash === '') return null;
  if (!isNaN(Number(hash))) {
    // If a numeric ID was provided directly in URL (legacy support)
    return Number(hash);
  }
  const decoded = hashids.decode(String(hash));
  if (decoded && decoded.length > 0) {
    return Number(decoded[0]);
  }
  return null;
};

export default hashids;
