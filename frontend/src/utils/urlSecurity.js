/**
 * URL Security & ID Obfuscation Utility
 * Encodes database sequence IDs into encrypted, URL-safe tokens and smoothly decodes them back.
 * Zero database/backend changes required.
 */

const SECRET_SALT = 0x5a3c9e1f;

/**
 * Encrypt a plain database ID into an encrypted URL token.
 * @param {number|string} id - The database record ID (e.g. 515)
 * @param {string} [prefix='gb'] - An optional prefix (e.g. 'gb' for guest-billing)
 * @returns {string} Encrypted URL-safe token (e.g. 'gb_cDFiMW94MWE')
 */
export const encodeUrlId = (id, prefix = 'gb') => {
  if (id === null || id === undefined || id === '') return '';
  const numId = Number(id);

  if (isNaN(numId)) {
    try {
      const encoded = btoa(encodeURIComponent(String(id)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      return prefix ? `${prefix}_${encoded}` : encoded;
    } catch {
      return String(id);
    }
  }

  try {
    const scrambled = ((numId ^ SECRET_SALT) >>> 0);
    const checksum = ((numId * 31 + 17) % 64);
    const combined = `${scrambled.toString(36)}x${checksum.toString(36)}`;
    const b64 = btoa(combined)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    return prefix ? `${prefix}_${b64}` : b64;
  } catch (e) {
    console.error('Error encoding URL ID:', e);
    return String(id);
  }
};

/**
 * Decrypt an encrypted URL token back to the original database ID.
 * Supports legacy plain numbers automatically.
 * @param {string} token - The encrypted token from useParams (e.g. 'gb_cDFiMW94MWE' or '515')
 * @returns {number|string} The original database ID
 */
export const decodeUrlId = (token) => {
  if (!token) return '';

  const rawTrimmed = String(token).trim();

  // Backward compatibility: If it's already a plain number, return it as number
  if (/^\d+$/.test(rawTrimmed)) {
    return Number(rawTrimmed);
  }

  try {
    let cleanToken = rawTrimmed;
    if (cleanToken.includes('_')) {
      const parts = cleanToken.split('_');
      cleanToken = parts.slice(1).join('_');
    }

    let b64 = cleanToken.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) {
      b64 += '=';
    }

    const decodedStr = atob(b64);
    if (decodedStr.includes('x')) {
      const [scrambled36, checksum36] = decodedStr.split('x');
      const scrambled = parseInt(scrambled36, 36);
      const originalNum = ((scrambled ^ SECRET_SALT) >>> 0);
      const expectedChecksum = ((originalNum * 31 + 17) % 64);
      if (parseInt(checksum36, 36) === expectedChecksum) {
        return originalNum;
      }
    }

    const raw = decodeURIComponent(decodedStr);
    if (/^\d+$/.test(raw)) return Number(raw);
    return raw || token;
  } catch (err) {
    console.warn('Fallback to raw token because decryption failed:', token, err);
    return token;
  }
};
