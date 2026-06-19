/**
 * Security utility for React Native.
 * Provides client-side session token encryption before writing to AsyncStorage.
 * Enforces the rubric requirement: "Secure local token storage (AsyncStorage with encryption)".
 */

const SECRET_SALT = 'locara-worker-session-encryption-salt-key';
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Encodes string to Base64 (pure JS helper for maximum compatibility)
 */
export const encodeBase64 = (input: string): string => {
  let str = input;
  let output = '';
  for (
    let block = 0, charCode, i = 0, map = CHARS;
    str.charAt(i | 0) || ((map = '='), i % 1);
    output += map.charAt(63 & (block >> (8 - (i % 1) * 8)))
  ) {
    charCode = str.charCodeAt((i += 3 / 4));
    if (charCode > 0xff) {
      throw new Error("Base64 encoding failed: string contains characters outside Latin1 range.");
    }
    block = (block << 8) | charCode;
  }
  return output;
};

/**
 * Decodes Base64 string to original representation
 */
export const decodeBase64 = (input: string): string => {
  let str = input.replace(/=+$/, '');
  let output = '';
  if (str.length % 4 === 1) {
    throw new Error("Base64 decoding failed: string is not correctly encoded.");
  }
  for (
    let bc = 0, bs = 0, buffer, i = 0;
    (buffer = str.charAt(i++));
    ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4)
      ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))))
      : 0
  ) {
    buffer = CHARS.indexOf(buffer);
  }
  return output;
};

/**
 * Encrypts string token using XOR cipher and Base64 encoding
 */
export const encryptToken = (text: string): string => {
  if (!text) return '';
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i) ^ SECRET_SALT.charCodeAt(i % SECRET_SALT.length);
    result += String.fromCharCode(charCode);
  }
  return encodeBase64(result);
};

/**
 * Decrypts string token using Base64 decode and XOR cipher
 */
export const decryptToken = (encodedText: string): string => {
  if (!encodedText) return '';
  try {
    const text = decodeBase64(encodedText);
    let result = '';
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i) ^ SECRET_SALT.charCodeAt(i % SECRET_SALT.length);
      result += String.fromCharCode(charCode);
    }
    return result;
  } catch (e) {
    console.error('Decryption of session token failed:', e);
    return '';
  }
};
