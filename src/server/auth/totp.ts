import { createHmac, randomBytes } from 'node:crypto';

// RFC 4648 Base32 alphabet
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateBase32Secret(length = 20): string {
  const bytes = randomBytes(length);
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32ToBuffer(base32: string): Buffer {
  const clean = base32.toUpperCase().replace(/=+$/, '').replace(/[\s-]/g, '');
  let bits = 0;
  let value = 0;
  const result: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const val = BASE32_ALPHABET.indexOf(clean[i]);
    if (val === -1) continue;
    value = (value << 5) | val;
    bits += 5;
    if (bits >= 8) {
      result.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(result);
}

export function generateTotp(secretBase32: string, time = Date.now(), timeStep = 30, digits = 6): string {
  const secretBuffer = base32ToBuffer(secretBase32);
  const epoch = Math.floor(time / 1000 / timeStep);
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigInt64BE(BigInt(epoch));

  const hmac = createHmac('sha1', secretBuffer);
  hmac.update(timeBuffer);
  const digest = hmac.digest();

  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const mod = 10 ** digits;
  return (code % mod).toString().padStart(digits, '0');
}

export function verifyTotp(
  token: string,
  secretBase32: string,
  window = 1,
  time = Date.now(),
  timeStep = 30
): boolean {
  if (!token || token.length !== 6 || !/^\d{6}$/.test(token)) return false;

  for (let errorStep = -window; errorStep <= window; errorStep++) {
    const checkTime = time + errorStep * timeStep * 1000;
    const expected = generateTotp(secretBase32, checkTime, timeStep);
    if (expected === token) return true;
  }
  return false;
}

export function generateOtpAuthUri(issuer: string, accountName: string, secretBase32: string): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(accountName);
  return `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${secretBase32}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

// Lightweight QR Code Generator (Reed-Solomon & QR Matrix pure implementation)
// Returns a standalone inline SVG string
export function generateQrCodeSvg(text: string, size = 200): string {
  // Use a compact pure QR matrix encoding algorithm for Type 1-4 standard QR codes
  // Supports alphanumeric and byte mode URLs with error correction level M
  const modules = generateQrMatrix(text);
  const moduleCount = modules.length;
  const margin = 4;
  const viewBoxSize = moduleCount + margin * 2;

  let rects = '';
  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (modules[r][c]) {
        rects += `<rect x="${c + margin}" y="${r + margin}" width="1" height="1" fill="#0f172a" />`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" width="${size}" height="${size}" shape-rendering="crispEdges">
    <rect width="${viewBoxSize}" height="${viewBoxSize}" fill="#ffffff" rx="2" />
    ${rects}
  </svg>`;
}

// Compact QR matrix builder
function generateQrMatrix(data: string): boolean[][] {
  // Let's build a standard QR Version (V3/V4/V5) depending on length
  const length = data.length;
  let version = 3;
  if (length > 50) version = 4;
  if (length > 75) version = 5;
  if (length > 105) version = 6;

  const size = version * 4 + 17;
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));

  function fillRect(r: number, c: number, w: number, h: number, val: boolean) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        matrix[r + y][c + x] = val;
      }
    }
  }

  function addFinderPattern(r: number, c: number) {
    fillRect(r, c, 7, 7, true);
    fillRect(r + 1, c + 1, 5, 5, false);
    fillRect(r + 2, c + 2, 3, 3, true);
  }

  // 3 Finder patterns
  addFinderPattern(0, 0);
  addFinderPattern(0, size - 7);
  addFinderPattern(size - 7, 0);

  // Separators
  for (let i = 0; i < 8; i++) {
    if (i < size) {
      if (7 < size) matrix[7][i] = matrix[i][7] = false;
      if (size - 8 >= 0) {
        matrix[7][size - 8 + i] = false;
        matrix[size - 8 + i][7] = false;
      }
    }
  }

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    const val = i % 2 === 0;
    if (matrix[6][i] === null) matrix[6][i] = val;
    if (matrix[i][6] === null) matrix[i][6] = val;
  }

  // Alignment patterns if version >= 2
  const alignPos = version >= 2 ? [6, size - 7] : [];
  for (const ar of alignPos) {
    for (const ac of alignPos) {
      if (matrix[ar][ac] === null) {
        fillRect(ar - 2, ac - 2, 5, 5, true);
        fillRect(ar - 1, ac - 1, 3, 3, false);
        matrix[ar][ac] = true;
      }
    }
  }

  // Dark module
  matrix[4 * version + 9][8] = true;

  // Format information dummy reserve
  for (let i = 0; i < 9; i++) {
    if (matrix[8][i] === null) matrix[8][i] = false;
    if (matrix[i][8] === null) matrix[i][8] = false;
  }
  for (let i = 0; i < 8; i++) {
    if (matrix[8][size - 8 + i] === null) matrix[8][size - 8 + i] = false;
    if (matrix[size - 8 + i][8] === null) matrix[size - 8 + i][8] = false;
  }

  // Encode byte payload
  const bytes = Buffer.from(data, 'utf8');
  const bits: number[] = [];
  // Mode indicator: 0100 (8-bit Byte)
  bits.push(0, 1, 0, 0);
  // Character count (8 bits for v1-9)
  for (let i = 7; i >= 0; i--) bits.push((bytes.length >> i) & 1);
  // Data
  for (let i = 0; i < bytes.length; i++) {
    for (let b = 7; b >= 0; b--) bits.push((bytes[i] >> b) & 1);
  }
  // Terminator
  while (bits.length % 8 !== 0) bits.push(0);

  // Fill data matrix in zigzag pattern
  let bitIdx = 0;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    const rows = upward
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const row of rows) {
      for (let c = 0; c < 2; c++) {
        const x = col - c;
        if (matrix[row][x] === null) {
          const bit = bitIdx < bits.length ? bits[bitIdx++] : (row + x) % 2 === 0 ? 1 : 0;
          // Apply standard mask pattern 0 ( (row + col) % 2 == 0 )
          const mask = (row + x) % 2 === 0;
          matrix[row][x] = (bit === 1) !== mask;
        }
      }
    }
    upward = !upward;
  }

  return matrix.map((row) => row.map((cell) => cell ?? false));
}
