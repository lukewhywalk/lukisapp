/**
 * Minimal QR Code encoder -- byte mode, error correction level M. Those are the
 * two choices the Swiss QR-bill specification fixes, so nothing else is needed
 * and everything else is left out.
 *
 * Vendored instead of loaded from a CDN: a payment code must not stop working
 * because a third party is unreachable, and the app is offline-first.
 *
 * qrMatrix(text) -> array of rows of 0/1, without the quiet zone.
 */

"use strict";

// Per version: [ecCodewordsPerBlock, blocksGroup1, dataPerBlockG1, blocksGroup2, dataPerBlockG2].
// Level M only. Twenty versions is far more than a QR-bill (~270 bytes) needs.
const BLOCKS_M = {
  1: [10, 1, 16, 0, 0],
  2: [16, 1, 28, 0, 0],
  3: [26, 1, 44, 0, 0],
  4: [18, 2, 32, 0, 0],
  5: [24, 2, 43, 0, 0],
  6: [16, 4, 27, 0, 0],
  7: [18, 4, 31, 0, 0],
  8: [22, 2, 38, 2, 39],
  9: [22, 3, 36, 2, 37],
  10: [26, 4, 43, 1, 44],
  11: [30, 1, 50, 4, 51],
  12: [22, 6, 36, 2, 37],
  13: [22, 8, 37, 1, 38],
  14: [24, 4, 40, 5, 41],
  15: [24, 5, 41, 5, 42],
  16: [28, 7, 45, 3, 46],
  17: [28, 10, 46, 1, 47],
  18: [26, 9, 43, 4, 44],
  19: [26, 3, 44, 11, 45],
  20: [26, 3, 41, 13, 42],
};

// Row/column centres of the alignment patterns, per version.
const ALIGNMENT = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
  11: [6, 30, 54],
  12: [6, 32, 58],
  13: [6, 34, 62],
  14: [6, 26, 46, 66],
  15: [6, 26, 48, 70],
  16: [6, 26, 50, 74],
  17: [6, 30, 54, 78],
  18: [6, 30, 56, 82],
  19: [6, 30, 58, 86],
  20: [6, 34, 62, 90],
};

/* ------------------------- GF(256) arithmetic ---------------------------- */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // the QR field's primitive polynomial
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

// Generator polynomial of the given degree, highest coefficient first.
function rsGenerator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function rsRemainder(data, ecLength) {
  const gen = rsGenerator(ecLength);
  const buf = new Uint8Array(data.length + ecLength);
  buf.set(data);
  for (let i = 0; i < data.length; i++) {
    const factor = buf[i];
    if (factor === 0) continue;
    for (let j = 0; j < gen.length; j++) buf[i + j] ^= gfMul(gen[j], factor);
  }
  return buf.slice(data.length);
}

/* ----------------------------- Encoding ---------------------------------- */

function totalDataCodewords(version) {
  const [, g1, d1, g2, d2] = BLOCKS_M[version];
  return g1 * d1 + g2 * d2;
}

// The smallest version that holds this many bytes, given the 4-bit mode
// indicator and the length field (8 bits below version 10, 16 from there).
function pickVersion(byteLength) {
  for (let version = 1; version <= 20; version++) {
    const overhead = 4 + (version < 10 ? 8 : 16);
    if (totalDataCodewords(version) * 8 - overhead >= byteLength * 8) return version;
  }
  throw new Error(`Data too long for a version 20 QR code: ${byteLength} bytes`);
}

function encodeCodewords(bytes, version) {
  const capacity = totalDataCodewords(version);
  const bits = [];
  const push = (value, length) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };

  push(0b0100, 4); // byte mode
  push(bytes.length, version < 10 ? 8 : 16);
  for (const byte of bytes) push(byte, 8);

  push(0, Math.min(4, capacity * 8 - bits.length)); // terminator
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }

  const padding = [0xec, 0x11]; // the two alternating pad codewords
  for (let i = 0; codewords.length < capacity; i++) codewords.push(padding[i % 2]);
  return codewords;
}

// Splits into blocks, appends each block's error correction, then interleaves
// both -- the order the symbol expects.
function interleave(codewords, version) {
  const [ecLength, g1, d1, g2, d2] = BLOCKS_M[version];
  const data = [];
  const ec = [];
  let pos = 0;
  for (const [count, size] of [[g1, d1], [g2, d2]]) {
    for (let i = 0; i < count; i++) {
      const block = codewords.slice(pos, pos + size);
      pos += size;
      data.push(block);
      ec.push(rsRemainder(Uint8Array.from(block), ecLength));
    }
  }

  const out = [];
  for (let i = 0; i < Math.max(d1, d2); i++) {
    for (const block of data) if (i < block.length) out.push(block[i]);
  }
  for (let i = 0; i < ecLength; i++) {
    for (const block of ec) out.push(block[i]);
  }
  return out;
}

/* ------------------------------ Symbol ----------------------------------- */

// 15-bit format information: level M, the chosen mask, a BCH remainder, and the
// fixed mask the standard XORs on top.
function formatBits(mask) {
  const data = (0b00 << 3) | mask; // 00 = error correction level M
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ (((rem >>> 9) & 1) * 0x537);
  return (((data << 10) | rem) ^ 0x5412) >>> 0;
}

// 18-bit version information, present from version 7 on.
function versionInfoBits(version) {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ (((rem >>> 11) & 1) * 0x1f25);
  return ((version << 12) | rem) >>> 0;
}

function maskAt(mask, row, col) {
  switch (mask) {
    case 0: return (row + col) % 2 === 0;
    case 1: return row % 2 === 0;
    case 2: return col % 3 === 0;
    case 3: return (row + col) % 3 === 0;
    case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5: return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6: return ((((row * col) % 2) + ((row * col) % 3)) % 2) === 0;
    default: return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
  }
}

// Lays down everything that is not data: finders, separators, timing,
// alignment, the dark module, and blanks where format/version bits will go.
function buildFunctionPatterns(version, size, modules, reserved) {
  const set = (row, col, value) => {
    modules[row][col] = value;
    reserved[row][col] = true;
  };

  for (const [baseRow, baseCol] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const row = baseRow + r;
        const col = baseCol + c;
        if (row < 0 || row >= size || col < 0 || col >= size) continue;
        const onRing = (r >= 0 && r <= 6 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === 0 || r === 6));
        const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        set(row, col, onRing || inCore ? 1 : 0);
      }
    }
  }

  for (let i = 8; i < size - 8; i++) {
    const value = i % 2 === 0 ? 1 : 0;
    set(6, i, value);
    set(i, 6, value);
  }

  for (const row of ALIGNMENT[version]) {
    for (const col of ALIGNMENT[version]) {
      if (reserved[row][col]) continue; // overlaps a finder -- omitted by the standard
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const ring = Math.max(Math.abs(dr), Math.abs(dc));
          set(row + dr, col + dc, ring === 1 ? 0 : 1);
        }
      }
    }
  }

  set(size - 8, 8, 1); // the always-dark module

  for (let i = 0; i <= 8; i++) {
    if (!reserved[8][i]) set(8, i, 0);
    if (!reserved[i][8]) set(i, 8, 0);
  }
  for (let i = 0; i < 8; i++) {
    if (!reserved[8][size - 1 - i]) set(8, size - 1 - i, 0);
    if (!reserved[size - 1 - i][8]) set(size - 1 - i, 8, 0);
  }

  if (version >= 7) {
    const bits = versionInfoBits(version);
    for (let i = 0; i < 18; i++) {
      const bit = (bits >>> i) & 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(b, a, bit);
      set(a, b, bit);
    }
  }
}

// Data snakes upward and downward in two-column strips, right to left, skipping
// the vertical timing column.
function placeData(size, modules, reserved, codewords) {
  const bits = [];
  for (const codeword of codewords) {
    for (let i = 7; i >= 0; i--) bits.push((codeword >>> i) & 1);
  }

  let index = 0;
  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right = 5;
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (const col of [right, right - 1]) {
        if (reserved[row][col]) continue;
        modules[row][col] = index < bits.length ? bits[index] : 0;
        index++;
      }
    }
    upward = !upward;
  }
}

function placeFormat(size, modules, mask) {
  const bits = formatBits(mask);
  for (let i = 0; i < 15; i++) {
    const bit = (bits >>> i) & 1;
    if (i <= 5) modules[i][8] = bit;
    else if (i === 6) modules[7][8] = bit;
    else if (i === 7) modules[8][8] = bit;
    else if (i === 8) modules[8][7] = bit;
    else modules[8][14 - i] = bit;

    if (i < 8) modules[8][size - 1 - i] = bit;
    else modules[size - 15 + i][8] = bit;
  }
}

// The standard's four penalty rules; the mask with the lowest total wins.
function penalty(size, modules) {
  let score = 0;

  const runScore = (line) => {
    let total = 0;
    let run = 1;
    for (let i = 1; i < line.length; i++) {
      if (line[i] === line[i - 1]) {
        run++;
      } else {
        if (run >= 5) total += 3 + (run - 5);
        run = 1;
      }
    }
    if (run >= 5) total += 3 + (run - 5);
    return total;
  };

  for (let i = 0; i < size; i++) {
    score += runScore(modules[i]);
    score += runScore(modules.map((row) => row[i]));
  }

  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = modules[r][c];
      if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) score += 3;
    }
  }

  const finderLike = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const matches = (line, start, pattern) => {
    for (let i = 0; i < pattern.length; i++) {
      if (line[start + i] !== pattern[i]) return false;
    }
    return true;
  };
  const reversed = [...finderLike].reverse();
  for (let i = 0; i < size; i++) {
    const row = modules[i];
    const col = modules.map((r) => r[i]);
    for (const line of [row, col]) {
      for (let start = 0; start + 11 <= size; start++) {
        if (matches(line, start, finderLike) || matches(line, start, reversed)) score += 40;
      }
    }
  }

  let dark = 0;
  for (const row of modules) for (const value of row) dark += value;
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return score;
}

/* ------------------------------- Public ---------------------------------- */

export function qrMatrix(text) {
  const bytes = Array.from(new TextEncoder().encode(text));
  const version = pickVersion(bytes.length);
  const size = version * 4 + 17;
  const codewords = interleave(encodeCodewords(bytes, version), version);

  const base = Array.from({ length: size }, () => new Array(size).fill(0));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));
  buildFunctionPatterns(version, size, base, reserved);
  placeData(size, base, reserved, codewords);

  let best = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const candidate = base.map((row) => [...row]);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!reserved[r][c] && maskAt(mask, r, c)) candidate[r][c] ^= 1;
      }
    }
    placeFormat(size, candidate, mask);
    const score = penalty(size, candidate);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}
