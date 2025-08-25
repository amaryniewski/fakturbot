// supabase/functions/_shared/crypto.ts

/**
 * Szyfrowanie AES-GCM (tylko po stronie serwera)
 */
export async function encryptAesGcm(plaintext: string, keyHex: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    hexToBytes(keyHex),
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  // Combine IV + encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return bytesToHex(combined);
}

/**
 * Odszyfrowanie AES-GCM (tylko po stronie serwera)
 */
export async function decryptAesGcm(encryptedHex: string, keyHex: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    hexToBytes(keyHex),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const combined = hexToBytes(encryptedHex);
  const iv = combined.slice(0, 12); // First 12 bytes are IV
  const encrypted = combined.slice(12); // Rest is encrypted data

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Konwersja hex string na Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Konwersja Uint8Array na hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Anonimizacja danych do logowania (bezpieczeństwo)
 */
export function anonymizeForLogs(data: any): any {
  if (typeof data === 'string') {
    // Anonimizuj długie stringi (prawdopodobnie tokeny/hashe)
    if (data.length > 20) {
      return data.slice(0, 8) + '***' + data.slice(-4);
    }
    // Anonimizuj NIP-y
    if (/^\d{10}$/.test(data)) {
      return data.slice(0, 3) + '***' + data.slice(-2);
    }
    return data;
  }
  
  if (typeof data === 'object' && data !== null) {
    const result: any = {};
    for (const [key, value] of Object.entries(data)) {
      // Ukryj wrażliwe pola
      if (['token', 'sessionToken', 'sessionId', 'password', 'secret'].includes(key)) {
        result[key] = typeof value === 'string' && value.length > 8 
          ? value.slice(0, 4) + '***' + value.slice(-4)
          : '[HIDDEN]';
      } else {
        result[key] = anonymizeForLogs(value);
      }
    }
    return result;
  }
  
  return data;
}

/**
 * Generowanie bezpiecznego hash SHA-256
 */
export async function calculateSha256Hash(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = new Uint8Array(hashBuffer);
  return bytesToHex(hashArray);
}